import { describe, it, expect } from 'vitest';
import {
  getCalibrationRatio,
  recordCalibrationSample,
  loadCalibration,
} from './token-calibration';
import { setSetting } from '../data/settings';

// Module-level calibration store is process-global within this file, so
// each test uses a unique provider:model key to stay isolated.
let k = 0;
const key = () => ({ provider: 'prov', model: `model-${k++}` });

describe('token calibration', () => {
  it('defaults to 1 with no data', () => {
    const { provider, model } = key();
    expect(getCalibrationRatio(provider, model)).toBe(1);
  });

  it('returns 1 for an empty model id', () => {
    expect(getCalibrationRatio('prov', '')).toBe(1);
  });

  it('skips short generations (below the min-actual-tokens floor)', async () => {
    const { provider, model } = key();
    await recordCalibrationSample(provider, model, 100, 150); // actual < 200
    expect(getCalibrationRatio(provider, model)).toBe(1);
  });

  it('nudges the ratio toward actual/estimate via EMA (alpha 0.3)', async () => {
    const { provider, model } = key();
    // sample = 1500/1000 = 1.5; EMA from prev 1 → 1*0.7 + 1.5*0.3 = 1.15
    await recordCalibrationSample(provider, model, 1000, 1500);
    expect(getCalibrationRatio(provider, model)).toBeCloseTo(1.15, 5);
  });

  it('rejects out-of-band samples (> 2x) as noise', async () => {
    const { provider, model } = key();
    // sample = 3000/1000 = 3 → outside [0.5, 2], skipped → stays 1
    await recordCalibrationSample(provider, model, 1000, 3000);
    expect(getCalibrationRatio(provider, model)).toBe(1);
  });

  it('rejects out-of-band samples (< 0.5x) as noise', async () => {
    const { provider, model } = key();
    // sample = 300/1000 = 0.3 → below 0.5, skipped → stays 1
    await recordCalibrationSample(provider, model, 1000, 300);
    expect(getCalibrationRatio(provider, model)).toBe(1);
  });

  // Keep last: loadCalibration replaces the whole in-memory store.
  it('loads persisted ratios from settings', async () => {
    await setSetting('tokenCalibration', { 'prov:loaded': 1.7 });
    await loadCalibration();
    expect(getCalibrationRatio('prov', 'loaded')).toBeCloseTo(1.7, 5);
  });
});
