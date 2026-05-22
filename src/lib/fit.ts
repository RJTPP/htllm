import type { FitResult } from '../providers/types';

export function fitFor(vramMB: number, deviceMemoryGB: number | null): FitResult {
  if (vramMB <= 0) return { fits: false, tight: false };
  const ramGB = deviceMemoryGB ?? 4;
  const budgetMB = ramGB * 1024 * 0.7;
  const fits = vramMB <= budgetMB;
  const tight = !fits && vramMB <= ramGB * 1024;
  return { fits, tight };
}
