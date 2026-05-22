/**
 * Detect reasoning capability from a model ID string.
 *
 * Used by both WebLLM and OpenAI-compatible providers to tag models
 * with the right level of reasoning control support.
 */

import type { ReasoningCapability } from '../providers/types';

/** Models that support granular reasoning effort (off/low/medium/high). */
const EFFORT_PATTERNS: RegExp[] = [
  /\bo[134]-/i,           // o1-preview, o3-mini, o4-mini, etc.
  /\bo[134]$/i,           // bare "o1", "o3", "o4"
  /openai\/o[134]/i,      // OpenRouter-style "openai/o3-mini"
  /gpt-o[134]/i,          // alternate naming "gpt-o3"
  /gpt-oss/i,             // openai/gpt-oss-* series
];

/** Models that support thinking toggle (on/off) only. */
const TOGGLE_PATTERNS: RegExp[] = [
  /qwen3/i,               // Qwen3 (not Qwen2.5)
  /\bqwq\b/i,             // QwQ
  /deepseek-r1/i,         // DeepSeek-R1
  /deepseek.*reason/i,    // DeepSeek reasoning variants
  /marco-o1/i,            // MFAI Marco-o1
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
