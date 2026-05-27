/**
 * Conversation budgeting for chat prompts — D10a (sliding window).
 *
 * Two layers compose to decide which conversation messages make it into
 * a chat request:
 *
 *   1. User-turn slicing (`sliceByUserTurns`) — caps how many of the
 *      user's most recent messages are included. Each user message
 *      brings its associated assistant reply along. Driven by the user's
 *      `historyMsgs` setting; 0 = no cap.
 *
 *   2. Token-budget sliding window (`fitToBudget`) — always-on safety
 *      net. Walks backwards from the latest message and includes as
 *      many as fit under the budget. The latest user message is
 *      preserved verbatim even if it alone exceeds the budget — the
 *      provider will error in that case, but we never silently drop
 *      the active intent.
 *
 * Compaction (D10b) plugs in on top of `fitToBudget`: when messages
 * are dropped, the dropped portion can be summarized and reinjected.
 * This module owns the pure budget math; the integration with the
 * chat provider lives in `useChat`.
 */

import type { Message } from '../providers/types';
import { estimateMessageTokens } from './tokens';

/**
 * Return the tail of `messages` that contains at most `n` user
 * messages. Walks backwards: counts a user message as 1, includes
 * everything from the Nth-most-recent user message onward.
 *
 * Edge cases:
 *  - n <= 0 → returns the original array unchanged (no cap)
 *  - fewer than n user messages exist → returns everything
 *  - trailing assistant message after the last user message is kept
 *    (it's part of the current exchange)
 *  - leading assistant messages BEFORE the first kept user message
 *    are dropped (their paired user is older than the cap)
 */
export function sliceByUserTurns(messages: Message[], n: number): Message[] {
  if (n <= 0 || messages.length === 0) return messages;

  let userSeen = 0;
  // Find the earliest index we want to keep. We're walking backwards,
  // so the first time `userSeen === n` we have our anchor — we keep
  // that index and everything after.
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') {
      userSeen++;
      if (userSeen === n) {
        return messages.slice(i);
      }
    }
  }
  // Ran off the start without hitting N — return everything.
  return messages;
}

export interface FitResult {
  /** Messages that fit under the budget, in original order. */
  kept: Message[];
  /** Messages that were dropped from the head, in original order. */
  dropped: Message[];
  /** Token count of `kept`. */
  keptTokens: number;
  /** Token count of `dropped`. */
  droppedTokens: number;
  /** True when the latest user message alone exceeds the budget. The
   *  caller still gets it in `kept` (we never drop the active intent)
   *  but the provider will likely error — surface a clear message
   *  rather than guessing. */
  singleMessageOverflow: boolean;
}

/**
 * Token-budget sliding window. Walks the messages from newest to
 * oldest, accumulating tokens, and stops when the next message would
 * push past `budget`. Dropped messages are returned separately so a
 * higher layer (compaction) can decide what to do with them.
 *
 * The latest message is always kept regardless of budget — dropping
 * it would mean ignoring the user's active prompt, which is worse
 * than overflowing.
 */
export function fitToBudget(messages: Message[], budget: number): FitResult {
  if (messages.length === 0) {
    return {
      kept: [],
      dropped: [],
      keptTokens: 0,
      droppedTokens: 0,
      singleMessageOverflow: false,
    };
  }

  if (budget <= 0) {
    // Pathological budget — still return the latest message so the
    // caller can surface a clear error.
    const last = messages[messages.length - 1]!;
    const tokens = estimateMessageTokens(last);
    return {
      kept: [last],
      dropped: messages.slice(0, -1),
      keptTokens: tokens,
      droppedTokens: messages
        .slice(0, -1)
        .reduce((s, m) => s + estimateMessageTokens(m), 0),
      singleMessageOverflow: tokens > 0,
    };
  }

  let accumulated = 0;
  let cutIndex = messages.length; // exclusive — everything at >= cutIndex is kept

  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(messages[i]!);
    if (i === messages.length - 1) {
      // Latest message is unconditional — keep it even if it overflows.
      accumulated += cost;
      cutIndex = i;
      continue;
    }
    if (accumulated + cost > budget) break;
    accumulated += cost;
    cutIndex = i;
  }

  const kept = messages.slice(cutIndex);
  const dropped = messages.slice(0, cutIndex);
  const droppedTokens = dropped.reduce(
    (s, m) => s + estimateMessageTokens(m),
    0,
  );

  return {
    kept,
    dropped,
    keptTokens: accumulated,
    droppedTokens,
    singleMessageOverflow: kept.length === 1 && accumulated > budget,
  };
}

/**
 * Compute the response-side reservation so the prompt budget leaves
 * room for the model's output. Caps at half the context window so a
 * generous `maxTokens` setting doesn't accidentally starve the prompt.
 */
export function reserveForResponse(
  contextWindow: number,
  maxTokens: number,
): number {
  return Math.min(maxTokens, Math.floor(contextWindow / 2));
}
