/**
 * Detect reasoning capability from a model ID string.
 *
 * Used by both WebLLM and OpenAI-compatible providers to tag models
 * with the right level of reasoning control support.
 */

import type { ReasoningCapability } from '../providers/types';

/** Models that support granular reasoning effort (off/low/medium/high). */
const EFFORT_PATTERNS: RegExp[] = [
  /\bo[134]-/i,       // OpenAI o1, o3, o4-mini, o3-pro, etc.
  /\bo[134]$/i,       // bare "o1", "o3", "o4"
];

/** Models that support thinking toggle (on/off) only. */
const TOGGLE_PATTERNS: RegExp[] = [
  /qwen3/i,           // Qwen3 (not Qwen2.5)
  /\bqwq\b/i,         // QwQ
  /deepseek-r1/i,     // DeepSeek-R1
  /deepseek.*reason/i, // DeepSeek reasoning variants
];

/**
 * Infer reasoning capability from a model ID.
 * Returns `'effort'`, `'toggle'`, or `undefined` (no reasoning).
 */
export function detectReasoning(modelId: string): ReasoningCapability | undefined {
  for (const re of EFFORT_PATTERNS) {
    if (re.test(modelId)) return 'effort';
  }
  for (const re of TOGGLE_PATTERNS) {
    if (re.test(modelId)) return 'toggle';
  }
  return undefined;
}
