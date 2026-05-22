import type { ModelInfo } from '../providers/types';

/** Maps a model family name (e.g. "Llama 3.2") to a brand-logo key. */
const BRAND_BY_PREFIX: [string, string][] = [
  ['Llama', 'meta'],
  ['Qwen', 'qwen'],
  ['Gemma', 'google'],
  ['Phi', 'microsoft'],
  ['Mistral', 'mistral'],
  ['SmolLM', 'hf'],
  ['DeepSeek', 'deepseek'],
  ['Hermes', 'hf'],
  ['Snowflake', 'snowflake'],
  ['BGE', 'bge'],
];

/** Family ordering for the model picker's family filter. */
const FAMILY_PRIORITY = ['Llama', 'Qwen', 'Gemma', 'Phi', 'Mistral', 'SmolLM', 'DeepSeek'];

export function brandForFamily(family: string): string | null {
  for (const [prefix, brand] of BRAND_BY_PREFIX) {
    if (family.startsWith(prefix)) return brand;
  }
  return null;
}

export function familyOf(modelId: string, models: ModelInfo[]): string | null {
  return models.find((m) => m.id === modelId)?.family ?? null;
}

export function brandForModelId(modelId: string, models: ModelInfo[]): string | null {
  const family = familyOf(modelId, models);
  return family ? brandForFamily(family) : null;
}

export function familyRank(family: string): number {
  const idx = FAMILY_PRIORITY.findIndex((prefix) => family.startsWith(prefix));
  return idx === -1 ? FAMILY_PRIORITY.length : idx;
}

export interface GroupedModel {
  /** displayName — shared across quantization variants. */
  name: string;
  family: string;
  vision: boolean;
  variants: ModelInfo[];
}

/** Folds the flat model list into one entry per model, with quant variants. */
export function groupByModel(models: ModelInfo[]): GroupedModel[] {
  const map = new Map<string, GroupedModel>();
  for (const m of models) {
    const existing = map.get(m.displayName);
    if (existing) {
      existing.variants.push(m);
      if (m.vision) existing.vision = true;
    } else {
      map.set(m.displayName, {
        name: m.displayName,
        family: m.family,
        vision: !!m.vision,
        variants: [m],
      });
    }
  }
  return Array.from(map.values());
}
