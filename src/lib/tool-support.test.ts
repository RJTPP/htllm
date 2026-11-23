import { describe, expect, it } from 'vitest';
import { nextOverride, resolveToolSupport } from './tool-support';

describe('resolveToolSupport', () => {
  it('orders provider, override, detected, assumed', () => {
    expect(resolveToolSupport(false, true, true)).toEqual({ supported: false, source: 'provider' });
    expect(resolveToolSupport(true, false, true)).toEqual({ supported: true, source: 'override' });
    expect(resolveToolSupport(true, false)).toEqual({ supported: false, source: 'detected' });
    expect(resolveToolSupport(true)).toEqual({ supported: true, source: 'assumed' });
  });
  it('stores an override only when it differs from the default', () => {
    expect(nextOverride(resolveToolSupport(true), undefined)).toBe(false);
    expect(nextOverride(resolveToolSupport(true, undefined, false), undefined)).toBeUndefined();
    expect(nextOverride(resolveToolSupport(true, false), false)).toBe(true);
    expect(nextOverride(resolveToolSupport(true, false, true), false)).toBeUndefined();
  });
});
