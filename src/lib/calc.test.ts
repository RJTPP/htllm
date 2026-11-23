import { describe, expect, it } from 'vitest';
import { calculate, formatNumber } from './calc';

describe('calculate', () => {
  it('follows precedence, associativity and functions', () => {
    expect(calculate('2 + 3 * 4')).toBe(14);
    expect(calculate('(2 + 3) * 4')).toBe(20);
    expect(calculate('2 ^ 3 ^ 2')).toBe(512);
    expect(calculate('-2 ^ 2')).toBe(4);
    expect(calculate('600 / 4')).toBe(150);
    expect(calculate('round(10 / 3, 2)')).toBe(3.33);
    expect(calculate('max(3, sqrt(16), 2) + abs(-1)')).toBe(5);
    expect(calculate('15% * 200')).toBe(30);
    expect(calculate('1,234 + 1')).toBe(1235);
    expect(formatNumber(calculate('0.1 + 0.2'))).toBe('0.3');
    expect(calculate('2 * pi')).toBeCloseTo(6.283185, 5);
  });
  it('refuses code, unknown names and bad input instead of evaluating them', () => {
    for (const bad of ['alert(1)', 'constructor', '1 +', '2 ** 3', '1 / 0', '5 % 0', '((((1', '"a"', 'sqrt(-1)', 'x']) {
      expect(() => calculate(bad)).toThrow();
    }
    expect(() => calculate('('.repeat(200) + '1' + ')'.repeat(200))).toThrow('nested too deeply');
  });
});
