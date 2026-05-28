/**
 * D10b — context compaction.
 *
 * Generates a single <summary>-shaped block that captures the gist of a
 * dropped portion of the conversation. Called by useChat when the
 * sliding window would otherwise drop messages AND the user opted in
 * via Compression=auto.
 *
 * Prompt structure synthesized from Claude Code, Codex, and Anthropic
 * API defaults — five required elements (goal, decisions, facts
 * verbatim, code, current state). Tool-call JSON is kept verbatim now
 * as cheap insurance for Phase 4.
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
  const priorBlock = priorSummary
    ? '\nThere is an existing summary from earlier in this thread — treat ' +
      'it as ground truth and ONLY add information from the new turns ' +
      'below.\n\n<existing-summary>\n' +
      priorSummary +
      '\n</existing-summary>\n'
    : '';

  return (
    'You are summarizing part of a chat conversation so it can continue ' +
    'in a smaller context window. The full transcript below will be ' +
    'replaced in subsequent requests by your summary — keep what matters.' +
    priorBlock +
    '\n\nPreserve in the summary, in this order:\n' +
    "1. The user's original goal and any explicit constraints/preferences.\n" +
    '2. Key decisions made and their rationale.\n' +
    '3. Facts established (file paths, identifiers, error messages, API\n' +
    '   shapes) — keep VERBATIM, do not paraphrase.\n' +
    '4. Code blocks the user authored or asked about — keep verbatim if\n' +
    '   short; otherwise keep signatures + one-line description.\n' +
    '5. Current state: what is done, what is in progress, what is next.\n' +
    '6. Any tool calls and their results — keep the JSON verbatim.\n' +
    '\n' +
    'Drop: small talk, retracted ideas, intermediate reasoning the user\n' +
    'did not act on. Do NOT invent details. If uncertain, omit.\n' +
    '\n' +
    'Output a single <summary>...</summary> block, under 800 tokens,\n' +
    'plain text inside (no markdown wrappers around the tag).\n' +
    '\n' +
    '<transcript>\n' +
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

    // Output budget per summarize call — adaptive to the window so a
    // small model isn't asked to reserve more than it has, but generous
    // enough that reasoning models can think before emitting.
    const summaryOutTokens = window
      ? Math.min(768, Math.max(256, Math.round(window * 0.2)))
      : 1024;

    // Per-call input budget (chars). Each fold call's prompt is:
    //   instructions (~300 tok) + prior summary (≤ summaryOut) + chunk
    //   + the reserved output (summaryOut).
    // So chunk ≤ window − 2·summaryOut − 300, with a 0.9 safety factor
    // to absorb token-estimate error and keep the call off the window
    // edge.
    const instructionTokens = 300;
    const inputTokenBudget = window
      ? Math.max(
          256,
          Math.floor(
            (window - 2 * summaryOutTokens - instructionTokens) * 0.9,
          ),
        )
      : Number.POSITIVE_INFINITY;
    const inputCharBudget =
      inputTokenBudget === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : Math.floor((inputTokenBudget * CHARS_PER_TOKEN) / calRatio);

    const summarizeOnce = async (
      chunk: string,
      prior: string | null,
    ): Promise<string | null> => {
      const prompt = buildPrompt(chunk, prior);
      let out = '';
      for await (const c of provider.chat({
        messages: [
          { id: '__compact', threadId: '', role: 'user', content: prompt, createdAt: 0 },
        ],
        modelId,
        temperature: 0.2,
        maxTokens: summaryOutTokens,
        reasoningEffort: 'off',
        signal: controller.signal,
      })) {
        out += c.delta;
      }
      return cleanSummary(out);
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

/** Strip reasoning + <summary> wrapper + leading/trailing junk. */
function cleanSummary(raw: string): string | null {
  let s = stripThinking(raw).trim();
  // Strip <summary> wrappers if the model included them verbatim.
  s = s.replace(/^<summary>\s*/i, '').replace(/\s*<\/summary>\s*$/i, '');
  s = s.replace(/^["'`*]+|["'`*]+$/g, '').trim();
  if (!s) return null;
  // Hard cap to keep a runaway summary from defeating the purpose.
  if (s.length > 6000) s = `${s.slice(0, 6000).trim()}…`;
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
