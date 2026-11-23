import { describe, expect, it } from 'vitest';
import { fmtBytes } from './format';

describe('fmtBytes', () => {
  it('uses the largest sensible unit instead of rounding small files to 0 MB', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2 KB');
    expect(fmtBytes(5 * 1024 ** 2)).toBe('5 MB');
    expect(fmtBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });

  it('shows a dash for unknown sizes', () => {
    expect(fmtBytes(null)).toBe('—');
    expect(fmtBytes(undefined)).toBe('—');
  });
});
