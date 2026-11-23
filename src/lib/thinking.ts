/**
 * Utilities for parsing and stripping `<think>...</think>` blocks emitted
 * by reasoning models (Qwen3, DeepSeek-R1, QwQ, etc.).
 *
 * The tags appear at the start of the assistant reply. The content inside
 * is the model's chain-of-thought reasoning and should be:
 * - displayed in a collapsible block in the UI,
 * - stripped from history context sent back to the model.
 */

export interface ThinkingResult {
  /** The chain-of-thought content, or null if no thinking block found. */
  thinking: string | null;
  /** The reply with thinking blocks removed. */
  reply: string;
  /** True when a `<think>` tag was opened but not yet closed (mid-stream). */
  isThinking: boolean;
}

// Openers: `<think>`, `<thought>`, and `<thought` / `<think` followed by whitespace
// (Gemma 4 through LM Studio, in later tool rounds). Closers: either name.
const OPENER = /<(?:think|thought)(?:>|(?=\s))/g;
const CLOSER = /<\/(?:think|thought)>/g;

/** Character ranges of fenced code blocks, where tags are literal text. */
function fencedRanges(content: string): [number, number][] {
  const ranges: [number, number][] = [];
  const fence = /^ {0,3}(```|~~~)/gm;
  let open: number | null = null; let marker = '';
  for (let m = fence.exec(content); m; m = fence.exec(content)) {
    if (open === null) { open = m.index; marker = m[1]!; }
    else if (m[1] === marker) { ranges.push([open, m.index + m[0].length]); open = null; }
  }
  if (open !== null) ranges.push([open, content.length]);
  return ranges;
}

/**
 * Parse thinking blocks from assistant message content.
 *
 * Every `<think>`/`<thought>` block outside fenced code is reasoning, wherever it
 * appears: in a Workspace turn each tool round adds its own text, so blocks can
 * follow earlier reply text. Three states:
 * 1. Complete: blocks closed. Returns the joined reasoning and the rest as reply.
 * 2. Mid-stream: the last block is still open. isThinking=true, and the reply is
 *    the text before it.
 * 3. No thinking: thinking=null, reply unchanged.
 */
export function parseThinking(content: string): ThinkingResult {
  const fenced = fencedRanges(content);
  const inFence = (at: number) => fenced.some(([a, b]) => at >= a && at < b);
  const parts: string[] = []; const reply: string[] = [];
  let cursor = 0; let isThinking = false;
  while (cursor < content.length) {
    OPENER.lastIndex = cursor;
    let open = OPENER.exec(content);
    while (open && inFence(open.index)) { OPENER.lastIndex = open.index + 1; open = OPENER.exec(content); }
    if (!open) break;
    reply.push(content.slice(cursor, open.index));
    const bodyStart = open.index + open[0].length;
    CLOSER.lastIndex = bodyStart;
    const close = CLOSER.exec(content);
    if (!close) { parts.push(content.slice(bodyStart)); isThinking = true; cursor = content.length; break; }
    parts.push(content.slice(bodyStart, close.index));
    cursor = close.index + close[0].length;
  }
  if (!parts.length) return { thinking: null, reply: content, isThinking: false };
  if (cursor < content.length) reply.push(content.slice(cursor));
  // A nested opener inside a block (`<thought …<thought>…</thought>`) starts a new step.
  const thinking = parts.flatMap((part) => part.split(OPENER)).map((step) => step.trim()).filter(Boolean).join('\n\n');
  return { thinking: thinking || null, reply: reply.join('').trim(), isThinking };
}

/**
 * Strip complete thinking blocks from content. Used to clean assistant messages
 * before sending them back as history context: the model should not see its own
 * chain-of-thought in prior turns. An unclosed block is kept as text.
 */
export function stripThinking(content: string): string {
  const parsed = parseThinking(content);
  if (parsed.thinking === null && !parsed.isThinking) return content;
  return parsed.isThinking ? content.trimStart() : parsed.reply;
}
