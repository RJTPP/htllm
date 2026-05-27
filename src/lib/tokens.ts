/**
 * Character-based token approximation.
 *
 * We don't ship a real tokenizer (gpt-tokenizer is ~50 KB, qwen is bigger,
 * and they all disagree on what a token is anyway). The chars/4 heuristic
 * is accurate enough for budget decisions in the 5-10% range, which is
 * well within the safety margin reserved for the response.
 *
 * Callers should always treat estimates as advisory — never assume exact
 * fit. The token-budget slider leaves ~10% headroom for this reason.
 */
import type { ContentPart, Message } from '../providers/types';
import { stripThinking } from './thinking';

/** Average chars per token for English-ish content. Empirical across
 *  OpenAI cl100k / Anthropic / Llama tokenizers — close enough that the
 *  10% budget headroom absorbs the variance. */
const CHARS_PER_TOKEN = 4;

/** Per-message overhead the chat APIs add (role label + delimiters).
 *  OpenAI documents ~4 tokens; we use 4 as a flat estimate across
 *  providers. Multiplied per message, so under-counting by 1 in 1000
 *  messages is still in the noise. */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

/** Estimate the token count of a plain string. */
export function estimateStringTokens(s: string): number {
  if (!s) return 0;
  return Math.ceil(s.length / CHARS_PER_TOKEN);
}

/** Estimate the token count of a single Message, including the per-msg
 *  envelope overhead. Image parts are counted at a fixed ~85 tokens
 *  (rough OpenAI vision "low detail" estimate) — accurate enough since
 *  vision usage in chat tends to be a handful of images, not a flood.
 *
 *  Mirrors what `useChat` strips before sending: for assistant messages,
 *  in-content `<think>...</think>` tags don't reach the provider, so
 *  they shouldn't count toward the budget either. (Local reasoning
 *  models — Qwen3, DeepSeek-R1 — bake reasoning into `content`; API
 *  providers use the separate `reasoning` field, which we already skip
 *  since only `content` is counted.) */
export function estimateMessageTokens(msg: Message): number {
  let body = 0;
  if (typeof msg.content === 'string') {
    const text =
      msg.role === 'assistant' ? stripThinking(msg.content) : msg.content;
    body = estimateStringTokens(text);
  } else {
    for (const part of msg.content as ContentPart[]) {
      if (part.type === 'text') {
        const text =
          msg.role === 'assistant' ? stripThinking(part.text) : part.text;
        body += estimateStringTokens(text);
      } else if (part.type === 'image_url') {
        body += 85;
      }
    }
  }
  return body + PER_MESSAGE_OVERHEAD_TOKENS;
}

/** Sum the estimated tokens of an array of messages. */
export function estimateMessagesTokens(msgs: Message[]): number {
  let total = 0;
  for (const m of msgs) total += estimateMessageTokens(m);
  return total;
}
