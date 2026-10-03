/**
 * D10b — context compaction.
 *
 * Generates a single <summary>-shaped block that captures the gist of a
 * dropped portion of the conversation. Called by useChat when the
 * sliding window would otherwise drop messages AND the user opted in
 * via Compression=auto.
 *
 * Prompt is Codex's open-source "context checkpoint compaction" handoff,
 * used unconditionally. When a prior summary exists it is included as
 * data so the prompt's Historical Context rule carries earlier history
 * forward cumulatively — re-compaction never discards it.
 *
 * Modeled on lib/contextualizer.ts: abort-aware, per-call timeout,
 * reasoning stripped from the output, hard cap on the result text.
 */

import type { ChatProvider, Message } from '../providers/types';
import { stripThinking } from './thinking';
import { activityContext } from './message-context';
import { getCalibrationRatio } from './token-calibration';

const COMPACT_TIMEOUT_MS = 60_000;
/** Rough chars-per-token, matching lib/tokens.ts. Used to size the stored
 *  summary cap in chars. */
const CHARS_PER_TOKEN = 4;

/** Render the messages-to-summarize as a single transcript the model
 *  can read. We strip <think> tags from assistant content (same as the
 *  send-time strip) so the summary sees what the user actually saw. */
function renderTranscript(messages: Message[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    let content = '';
    if (typeof m.content === 'string') {
      content = m.role === 'assistant' ? stripThinking(m.content) : m.content;
    } else {
      const parts = m.content
        .map((p) => {
          if (p.type === 'text') {
            return m.role === 'assistant' ? stripThinking(p.text) : p.text;
          }
          if (p.type === 'image_url') return '[image]';
          return '';
        })
        .filter(Boolean);
      content = parts.join('\n');
    }
    content += activityContext(m);
    if (!content.trim()) continue;
    lines.push(`### ${m.role}\n${content.trim()}`);
  }
  return lines.join('\n\n');
}

function buildPrompt(transcript: string, priorSummary: string | null): string {
  // The prior summary, when present, is included as data so the
  // "if this conversation already contains a compacted summary"
  // instruction below has something to act on. The instruction text
  // itself is unconditional.
  const priorBlock = priorSummary
    ? '\n\n<previous-compaction-summary>\n' +
      priorSummary +
      '\n</previous-compaction-summary>'
    : '';

  return (
    'You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff ' +
    'summary for another LLM that will resume the task.\n\n' +
    'Include:\n' +
    '- Current progress and key decisions made\n' +
    '- Important context, constraints, or user preferences\n' +
    '- What remains to be done (clear next steps)\n' +
    '- Any critical data, examples, or references needed to continue\n\n' +
    'Be concise, structured, and focused on helping the next LLM seamlessly ' +
    'continue the work.\n\n' +
    'If this conversation already contains a compacted summary from a ' +
    'previous compaction, extract its key historical thread (what was done, ' +
    'key decisions and WHY, outcomes, direction) and include it as a ' +
    'cumulative Historical Context section at the top of your new summary. ' +
    'Each compaction adds 3-5 sentences. Never discard entries from previous ' +
    'compactions.' +
    priorBlock +
    '\n\n<transcript>\n' +
    transcript +
    '\n</transcript>'
  );
}

export interface CompactResult {
  /** The summary text (no <summary> tags, ready to embed in prompts). */
  text: string;
}

/**
 * Run the compaction LLM call. Returns null on any failure path so the
 * caller (useChat) can fall back to plain drop without blocking the
 * chat — a missing summary is bad, but a broken chat is worse.
 *
 * `priorSummary`, when provided, is fed back into the prompt as ground
 * truth so re-compaction doesn't lose what earlier summaries captured.
 */
export async function compact(
  messages: Message[],
  provider: ChatProvider,
  modelId: string,
  opts: {
    priorSummary?: string | null;
    signal?: AbortSignal;
    /** Sizes input parts and the existing stored-summary cap. */
    contextWindow?: number;
  } = {},
): Promise<CompactResult | null> {
  if (!modelId || messages.length === 0) return null;

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const transcript = renderTranscript(messages);
    const window = opts.contextWindow ?? 0;

    // Cap on the STORED summary. It lives in the system prompt on every
    // later request and counts toward the auto-compaction trigger, so a
    // runaway summary would keep the prompt perched above the trigger
    // ("compaction treadmill"). Floor at 2048 tok so even a tiny window
    // keeps a usable summary, scaling to 30% of the window for larger
    // models.
    const summaryTokenCap = window
      ? Math.max(2048, Math.round(window * 0.3))
      : 2048;

    // Preserve the original prompt and output handling for every request.
    // In particular, do not add maxTokens: some thinking models otherwise
    // consume that cap before emitting their summary in the content channel.
    let calls = 0;
    const summarize = async (prompt: string): Promise<string | null> => {
      if (controller.signal.aborted || opts.signal?.aborted || ++calls > 64) return null;
      timer = setTimeout(() => controller.abort(), COMPACT_TIMEOUT_MS);
      try {
        let out = '';
        let outReasoning = '';
        for await (const c of provider.chat({
          messages: [
            { id: '__compact', threadId: '', role: 'user', content: prompt, createdAt: 0 },
          ],
          modelId,
          reasoningEffort: 'off',
          signal: controller.signal,
        })) {
          out += c.delta;
          if (c.reasoning) outReasoning += c.reasoning;
        }
        // Prefer the content channel, but fall back to the reasoning channel
        // when content is empty. Some reasoning models (e.g. gpt-oss) ignore
        // enable_thinking:false and emit the whole answer as `reasoning` with
        // no `content` — without this fallback the summary comes back empty,
        // no summary is saved, and the "compacting…" indicator vanishes with
        // no divider.
        const raw = out.trim() ? out : outReasoning;
        // Trim the stored summary to the cap so it can't bloat the ongoing
        // budget or re-trip the trigger.
        const text = cleanSummary(raw, summaryTokenCap * CHARS_PER_TOKEN);
        if (!text) {
          console.warn('[compact] empty/unusable summary from model');
          return null;
        }
        return controller.signal.aborted ? null : text;
      } finally { clearTimeout(timer); }
    };

    const prompt = buildPrompt(transcript, opts.priorSummary ?? null);
    const ratio = Math.max(1, getCalibrationRatio(provider.id, modelId));
    // Leave headroom for generation. Small inputs retain the single-call path.
    const inputChars = window ? Math.floor(window * 0.75 * CHARS_PER_TOKEN / ratio) : Infinity;
    if (prompt.length <= inputChars) {
      const text = await summarize(prompt);
      return text ? { text } : null;
    }
    const overhead = buildPrompt('', null).length;
    const partChars = Math.floor(window * 0.5 * CHARS_PER_TOKEN / ratio) - overhead;
    if (partChars < 256) return null;
    const split = (text: string): string[] => {
      const parts: string[] = [];
      for (let offset = 0; offset < text.length;) {
        let end = Math.min(text.length, offset + partChars);
        if (end < text.length) {
          const boundary = text.lastIndexOf('\n\n', end);
          if (boundary > offset + partChars / 2) end = boundary;
          if (/[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
        }
        parts.push(text.slice(offset, end)); offset = end;
      }
      return parts;
    };
    // Prior history is included once, in chronological order, and carried
    // through the aggregation instead of being repeated in every part.
    let pending = split((opts.priorSummary ? `<previous-compaction-summary>\n${opts.priorSummary}\n</previous-compaction-summary>\n\n` : '') + transcript);
    for (let round = 0; round < 8; round++) {
      const summaries: string[] = [];
      for (const part of pending) {
        const text = await summarize(buildPrompt(part, null));
        if (!text) return null;
        summaries.push(text);
      }
      const aggregate = summaries.map((text, index) => `### Part ${index + 1}\n${text}`).join('\n\n');
      const mergePrompt = buildPrompt(aggregate, null);
      if (mergePrompt.length <= inputChars) {
        const text = await summarize(mergePrompt);
        return text ? { text } : null;
      }
      // A model that does not compress must not cause an unbounded loop.
      if (aggregate.length >= pending.join('\n\n').length) return null;
      pending = split(aggregate);
    }
    return null;
  } catch (err) {
    if (controller.signal.aborted) {
      console.warn(`[compact] aborted/timed out after ${COMPACT_TIMEOUT_MS}ms`);
    } else {
      console.warn('[compact] generation failed:', err);
    }
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/** Strip reasoning + <summary> wrapper + leading/trailing junk. `maxChars`
 *  scales with the model's window so the summary can't outgrow it. */
function cleanSummary(raw: string, maxChars: number): string | null {
  let s = stripThinking(raw).trim();
  // Strip <summary> wrappers if the model included them verbatim.
  s = s.replace(/^<summary>\s*/i, '').replace(/\s*<\/summary>\s*$/i, '');
  s = s.replace(/^["'`*]+|["'`*]+$/g, '').trim();
  if (!s) return null;
  // Hard cap to keep a runaway summary from defeating the purpose.
  const cap = Math.max(800, Math.floor(maxChars));
  if (s.length > cap) s = `${s.slice(0, cap).trim()}…`;
  return s;
}

/** Compose the inject-ready system block from a stored summary text.
 *  Centralized so retrieval-side tooling can mirror the formatting if
 *  we ever need to reproduce the prompt exactly. */
export function formatSummaryBlock(summaryText: string): string {
  return (
    "Earlier in this conversation (turns now compacted):\n" +
    '<summary>\n' +
    summaryText +
    '\n</summary>'
  );
}

/** Separate block for a recent exchange that was too long to keep
 *  verbatim — summarized on its own and kept distinct from the history
 *  <summary> above. */
export function formatTailBlock(summaryText: string): string {
  return (
    'A recent turn was too long to include verbatim — here is its ' +
    'summary:\n' +
    '<recent-context>\n' +
    summaryText +
    '\n</recent-context>'
  );
}
