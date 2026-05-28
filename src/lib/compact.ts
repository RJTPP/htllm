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
    /** The chat model's context window (tokens). Only used to size the cap
     *  on the STORED summary so it can't dominate the system prompt and
     *  re-trip the auto-compaction trigger. */
    contextWindow?: number;
  } = {},
): Promise<CompactResult | null> {
  if (!modelId || messages.length === 0) return null;

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort);
  const timer = setTimeout(() => controller.abort(), COMPACT_TIMEOUT_MS);

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

    // Single call — pass the whole transcript. No chunk/fold machinery:
    // for API providers the backend window is large, and for WebLLM the
    // 60s timeout + graceful null-on-error (caller falls back to a plain
    // trim) cover an oversized transcript. No maxTokens — a hard cap
    // truncates thinking models mid-reason into an empty summary.
    const prompt = buildPrompt(transcript, opts.priorSummary ?? null);
    let out = '';
    for await (const c of provider.chat({
      messages: [
        { id: '__compact', threadId: '', role: 'user', content: prompt, createdAt: 0 },
      ],
      modelId,
      reasoningEffort: 'off',
      signal: controller.signal,
    })) {
      out += c.delta;
    }
    // Trim the stored summary to the cap so it can't bloat the ongoing
    // budget or re-trip the trigger.
    const text = cleanSummary(out, summaryTokenCap * CHARS_PER_TOKEN);
    if (!text) {
      console.warn('[compact] empty/unusable summary from model');
      return null;
    }
    return { text };
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
