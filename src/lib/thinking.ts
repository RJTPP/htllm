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

/**
 * Parse thinking blocks from assistant message content.
 *
 * Handles three states:
 * 1. Complete: `<think>reasoning</think>reply` — returns both parts
 * 2. Mid-stream: `<think>partial reasoning...` — isThinking=true, reply=''
 * 3. No thinking: plain reply text — thinking=null
 */
export function parseThinking(content: string): ThinkingResult {
  const trimmed = content.trimStart();

  // No thinking block at all.
  if (!trimmed.startsWith('<think>')) {
    return { thinking: null, reply: content, isThinking: false };
  }

  const closeIdx = trimmed.indexOf('</think>');

  if (closeIdx === -1) {
    // <think> opened but not closed — still thinking (mid-stream).
    const thinkContent = trimmed.slice('<think>'.length);
    return {
      thinking: thinkContent || null,
      reply: '',
      isThinking: true,
    };
  }

  // Complete thinking block.
  const thinkContent = trimmed.slice('<think>'.length, closeIdx);
  const reply = trimmed.slice(closeIdx + '</think>'.length);

  return {
    thinking: thinkContent.trim() || null,
    reply: reply.trimStart(),
    isThinking: false,
  };
}

/**
 * Strip all `<think>...</think>` blocks from content. Used to clean
 * assistant messages before sending them back as history context —
 * the model should not see its own chain-of-thought in prior turns.
 */
export function stripThinking(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart();
}
