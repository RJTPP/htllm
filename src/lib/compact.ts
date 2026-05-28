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
/** Rough chars-per-token, matching lib/tokens.ts. Used to size chunks
 *  against the model's window when the transcript is too big for one
 *  call. */
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
    /** The chat model's context window (tokens). When set, oversized
     *  transcripts are summarized in window-sized chunks instead of one
     *  call that would overflow a small model. Falls back to a single
     *  call when omitted. */
    contextWindow?: number;
    /** Per-model token calibration multiplier (lib/token-calibration).
     *  Sizes chunks against the model's real tokenization. Default 1. */
    calRatio?: number;
    /** True only when contextWindow IS the model's real window (WebLLM).
     *  For API providers the window is a budgeting guess that may
     *  overshoot the backend's real limit, so we cap chunks at a
     *  conservative ceiling to avoid "prompt > context length" errors. */
    trustWindow?: boolean;
  } = {},
): Promise<CompactResult | null> {
  if (!modelId || messages.length === 0) return null;

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort);
  const timer = setTimeout(() => controller.abort(), COMPACT_TIMEOUT_MS);

  try {
    const transcript = renderTranscript(messages);
    const calRatio = opts.calRatio && opts.calRatio > 0 ? opts.calRatio : 1;
    const window = opts.contextWindow ?? 0;

    // Room reserved (per call) for the model's generation. We DON'T send
    // this as max_tokens — thinking models burn tokens reasoning before
    // emitting, and a hard cap truncates them mid-think into an empty
    // summary. Instead we leave this much of the window free and let the
    // model generate until it stops on its own (the 60s timeout guards
    // runaway). ~40% of the window, floored at 2048, so even reasoning-
    // heavy models have space to think and finish.
    const outputReserveTokens = window
      ? Math.min(8192, Math.max(2048, Math.round(window * 0.4)))
      : 2048;

    // Budget for the STORED summary — separate from the generation reserve
    // (outputReserveTokens, ~40% of window) which the model needs free to
    // reason AND emit. The summary lives in the system prompt on every
    // later request and counts toward the auto-compaction trigger, so it
    // shouldn't run near the generation reserve or it keeps the system
    // prompt perched above the trigger ("compaction treadmill"). Floor at
    // 2048 tok so even a tiny window keeps a usable summary, scaling to
    // 30% of the window for larger models.
    const summaryTokenCap = window
      ? Math.max(2048, Math.round(window * 0.3))
      : 2048;

    // Per-call input budget (chars). The prompt is instructions (~300) +
    // prior summary (≤ summaryTokenCap) + chunk, and we leave the larger
    // outputReserve free for generation:
    //   chunk ≤ window − outputReserve(generation) − summaryCap(prior)
    //           − 300, with a 0.9 safety factor.
    const instructionTokens = 300;
    let inputTokenBudget = window
      ? Math.max(
          256,
          Math.floor(
            (window - outputReserveTokens - summaryTokenCap - instructionTokens) *
              0.9,
          ),
        )
      : Number.POSITIVE_INFINITY;
    // For API providers we can't trust `window` to be the backend's real
    // limit — cap chunks conservatively so a too-small real window
    // doesn't reject the compaction prompt. Costs extra fold calls on
    // genuinely large models, but never overflows. (~2500 + summaryOut +
    // instructions stays under a 4k real window.)
    if (!opts.trustWindow) {
      inputTokenBudget = Math.min(inputTokenBudget, 2500);
    }
    const inputCharBudget = Number.isFinite(inputTokenBudget)
      ? Math.floor((inputTokenBudget * CHARS_PER_TOKEN) / calRatio)
      : Number.POSITIVE_INFINITY;

    const summarizeOnce = async (
      chunk: string,
      prior: string | null,
    ): Promise<string | null> => {
      const prompt = buildPrompt(chunk, prior);
      let out = '';
      for await (const c of provider.chat({
        // No maxTokens — let the model finish on its own (the window is
        // the real limit; a hard cap truncates thinking models). The
        // result is trimmed below if it overruns the reserve.
        messages: [
          { id: '__compact', threadId: '', role: 'user', content: prompt, createdAt: 0 },
        ],
        modelId,
        temperature: 0.2,
        reasoningEffort: 'off',
        signal: controller.signal,
      })) {
        out += c.delta;
      }
      // Trim the stored summary to the tight summary cap so it can't bloat
      // the ongoing budget, re-trip the trigger, or overflow when fed back
      // as a prior next round.
      return cleanSummary(out, summaryTokenCap * CHARS_PER_TOKEN);
    };

    // Fast path: the whole transcript fits in one call.
    if (transcript.length <= inputCharBudget) {
      const text = await summarizeOnce(transcript, opts.priorSummary ?? null);
      if (!text) {
        console.warn('[compact] empty/unusable summary from model');
        return null;
      }
      return { text };
    }

    // Map-reduce path: the transcript is bigger than the model can take
    // in one shot (e.g. a long code reply on a small-window model). Split
    // into window-sized chunks and fold them into a running summary —
    // each step sees the prior summary + the next chunk.
    const chunks = splitToCharBudget(transcript, inputCharBudget);
    console.debug(
      `[compact] transcript too large for one call — folding ${chunks.length} chunks ` +
        `(~${inputTokenBudget} tok each, window ${window}).`,
    );
    let running: string | null = opts.priorSummary ?? null;
    for (const chunk of chunks) {
      const text = await summarizeOnce(chunk, running);
      if (!text) {
        // A failed fold step — return what we have so far rather than
        // nothing, so the caller still gets a (partial) summary instead
        // of falling back to a full trim.
        if (running && running !== (opts.priorSummary ?? null)) {
          return { text: running };
        }
        console.warn('[compact] fold step produced no summary');
        return null;
      }
      running = text;
    }
    return running ? { text: running } : null;
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

/**
 * Split text into pieces each at most `budget` chars, preferring line
 * boundaries. A single line longer than the budget is hard-split.
 */
function splitToCharBudget(text: string, budget: number): string[] {
  if (!Number.isFinite(budget) || budget <= 0) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (line.length > budget) {
      // Flush what we have, then hard-split the oversized line.
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += budget) {
        chunks.push(line.slice(i, i + budget));
      }
      continue;
    }
    if (current.length + line.length + 1 > budget) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
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
