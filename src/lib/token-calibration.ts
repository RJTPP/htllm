/**
 * Per-model token-estimate calibration.
 *
 * Our base estimate is chars/4 — accurate to ~±10-20% and biased
 * differently per tokenizer (code is denser, CJK denser still, Llama vs
 * cl100k differ). Rather than ship a real tokenizer (50KB+, and still
 * wrong for whatever model the user actually loads), we self-correct:
 * every provider response reports `usage.promptTokens` — the REAL token
 * count of the prompt we just sent. Compare that to our raw estimate of
 * the same prompt and nudge a per-model ratio toward `actual / estimate`.
 *
 * The ratio is applied as a multiplier on future estimates (see
 * `lib/tokens.ts`), so after a couple of turns the meter and the
 * compaction thresholds converge to that model's real tokenization —
 * free, no dependency, works for every provider (local + API), stays
 * synchronous.
 */

import { getSetting, setSetting } from '../data/settings';

const CALIBRATION_KEY = 'tokenCalibration';
/** EMA weight for each new sample. 0.3 → converges in a few turns while
 *  staying robust to a single noisy reading. */
const ALPHA = 0.3;
/** Clamp samples to a sane tokenization-bias band. Outside this is
 *  almost never real bias — it's noise (a tiny response) or a metric we
 *  don't model — and would poison the ratio. */
const MIN_SAMPLE = 0.5;
const MAX_SAMPLE = 2;
/** Skip samples from short generations — too few tokens to be a reliable
 *  read on the tokenizer's chars/token ratio. */
const MIN_ACTUAL_TOKENS = 200;

let store: Record<string, number> = {};

function keyOf(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/** Load persisted ratios into the in-memory store. Call once on app
 *  start; until then getCalibrationRatio returns 1 (raw estimate). */
export async function loadCalibration(): Promise<void> {
  const v = await getSetting<Record<string, number>>(CALIBRATION_KEY);
  if (v && typeof v === 'object') store = { ...v };
}

/** Multiplier to apply to raw estimates for this model. 1 = no data yet. */
export function getCalibrationRatio(providerId: string, modelId: string): number {
  if (!modelId) return 1;
  const r = store[keyOf(providerId, modelId)];
  return r && r > 0 ? r : 1;
}

/**
 * Fold a new observation into the model's ratio. We calibrate from the
 * GENERATED OUTPUT, not the prompt: `completionTokens` is always the
 * full real count (output is never cached, unlike prompt tokens, which
 * providers under-report when a prefix is cached), and it runs through
 * the same tokenizer — so its chars/token bias applies to prompt
 * estimation too. `rawEstimate` MUST be the uncalibrated (ratio=1)
 * estimate of the exact generated text that produced `actualTokens`.
 */
export async function recordCalibrationSample(
  providerId: string,
  modelId: string,
  rawEstimate: number,
  actualTokens: number,
): Promise<void> {
  if (!modelId || rawEstimate <= 0 || actualTokens < MIN_ACTUAL_TOKENS) return;
  const sample = actualTokens / rawEstimate;
  if (sample < MIN_SAMPLE || sample > MAX_SAMPLE) return;
  const key = keyOf(providerId, modelId);
  const prev = store[key] ?? 1;
  store[key] = prev * (1 - ALPHA) + sample * ALPHA;
  await setSetting(CALIBRATION_KEY, store);
}
