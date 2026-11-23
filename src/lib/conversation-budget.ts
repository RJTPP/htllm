/**
 * Conversation budgeting for chat prompts.
 *
 * The whole conversation flows into the prompt; context is managed by
 * compaction (D10b) and, in drop mode, the token-budget sliding window
 * (`fitToBudget`) — both keyed on token estimates, not a message count.
 * `recencyBoundaryIndex` decides how much recent context compaction
 * must keep verbatim. This module owns the pure budget math; the
 * integration with the chat provider lives in `useChat`.
 */

import type { Message } from '../providers/types';
import { estimateMessageTokens } from './tokens';

/**
 * Index of the first message to KEEP verbatim when compacting, given
 * how many recent exchanges to protect. Everything before this index is
 * eligible for summarization; everything at/after stays as-is.
 *
 * An "exchange" is anchored on a user message. Two cases:
 *
 *  - Send time — the list ends with a pending user turn that has no
 *    reply yet:
 *      [ ...older, prevUser, prevAssistant, newUser ]
 *    With keepExchanges=1 we keep the last completed exchange
 *    (prevUser + prevAssistant) PLUS the pending newUser, so we walk to
 *    the (keepExchanges + 1)-th user message.
 *
 *  - Manual / idle — the list ends with a completed assistant reply:
 *      [ ...older, lastUser, lastAssistant ]
 *    With keepExchanges=1 we keep [lastUser, lastAssistant], so we walk
 *    to the keepExchanges-th user message (no +1).
 *
 * Detecting the trailing pending user turn is what distinguishes the
 * two — without it, manual compaction on a short thread keeps one
 * exchange too many and finds nothing to compact.
 *
 * Returns 0 when there aren't enough user messages to protect that many
 * exchanges (i.e. keep everything; nothing to compact).
 */
export function recencyBoundaryIndex(
  messages: Message[],
  keepExchanges: number,
): number {
  if (keepExchanges <= 0) return messages.length;
  const lastIsPendingUser =
    messages.length > 0 && messages[messages.length - 1]!.role === 'user';
  const target = keepExchanges + (lastIsPendingUser ? 1 : 0);
  let userSeen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') {
      userSeen++;
      if (userSeen === target) return i;
    }
  }
  return 0;
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
export function fitToBudget(
  messages: Message[],
  budget: number,
  ratio = 1,
): FitResult {
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
    const tokens = estimateMessageTokens(last, ratio);
    return {
      kept: [last],
      dropped: messages.slice(0, -1),
      keptTokens: tokens,
      droppedTokens: messages
        .slice(0, -1)
        .reduce((s, m) => s + estimateMessageTokens(m, ratio), 0),
      singleMessageOverflow: tokens > 0,
    };
  }

  let accumulated = 0;
  let cutIndex = messages.length; // exclusive — everything at >= cutIndex is kept

  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(messages[i]!, ratio);
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
    (s, m) => s + estimateMessageTokens(m, ratio),
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

/** Minimum output room guaranteed by trimming/compaction. Small on
 *  purpose — the prompt should be able to use most of the window, and
 *  the actual output cap is computed dynamically at send (min of the
 *  user's maxTokens and whatever space remains). */
export const RESPONSE_RESERVE_FLOOR = 512;

/**
 * Response-side reservation for budget math. Only a small floor — NOT
 * the full maxTokens — so the usable input budget stays close to the
 * context window. (Previously reserved up to half the window, which made
 * a 4096 window's budget read as 2k.) Actual output length is bounded
 * separately at send time.
 */
export function reserveForResponse(
  _contextWindow: number,
  maxTokens: number,
): number {
  return Math.min(maxTokens, RESPONSE_RESERVE_FLOOR);
}
