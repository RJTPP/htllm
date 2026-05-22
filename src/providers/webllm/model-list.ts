import { prebuiltAppConfig, hasModelInCache, ModelType } from '@mlc-ai/web-llm';
import type { ModelInfo } from '../types';

function parseFamily(modelId: string): string {
  const id = modelId.toLowerCase();
  // Base families — versions (Llama 2/3, Qwen 2/3, …) collapse into one group.
  // Order matters: more specific names first (DeepSeek/TinyLlama embed "llama").
  const families: [RegExp, string][] = [
    [/deepseek/i, 'DeepSeek'],
    [/tinyllama/i, 'TinyLlama'],
    [/llama/i, 'Llama'],
    [/qwen/i, 'Qwen'],
    [/gemma/i, 'Gemma'],
    [/phi/i, 'Phi'],
    [/mistral/i, 'Mistral'],
    [/smollm/i, 'SmolLM'],
    [/hermes/i, 'Hermes'],
    [/stablelm/i, 'StableLM'],
  ];

  for (const [re, name] of families) {
    if (re.test(id)) return name;
  }

  const parts = modelId.split('-');
  return parts[0] ?? 'Other';
}

function parseQuantization(modelId: string): string {
  const m = modelId.match(/q(\d)f(\d+)/);
  if (m) return `q${m[1]}`;
  if (modelId.includes('q4f')) return 'q4';
  if (modelId.includes('q0f')) return 'fp';
  return 'fp';
}

function parseDisplayName(modelId: string): string {
  return modelId.replace(/-MLC$/, '').replace(/-q\df\d+(?:_\d+)?/, '');
}

export async function getModelList(): Promise<ModelInfo[]> {
  const list = prebuiltAppConfig.model_list ?? [];
  // Include every LLM/VLM; exclude only embedding models. Name-based filtering
  // missed models without an "-Instruct" suffix (e.g. the Qwen3 series).
  const chatModels = list.filter((m) => m.model_type !== ModelType.embedding);

  chatModels.sort((a, b) => (a.vram_required_MB ?? 99999) - (b.vram_required_MB ?? 99999));

  const models: ModelInfo[] = await Promise.all(
    chatModels.map(async (m) => ({
      id: m.model_id,
      displayName: parseDisplayName(m.model_id),
      family: parseFamily(m.model_id),
      vramRequiredMB: m.vram_required_MB ?? 0,
      quantization: parseQuantization(m.model_id),
      cached: await hasModelInCache(m.model_id).catch(() => false),
      vision: m.model_type === ModelType.VLM || /-VL-|vision/i.test(m.model_id),
    })),
  );

  return models;
}

export interface ModelFamily {
  name: string;
  models: ModelInfo[];
}

export function groupByFamily(models: ModelInfo[]): ModelFamily[] {
  const map = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const list = map.get(m.family) ?? [];
    list.push(m);
    map.set(m.family, list);
  }
  return Array.from(map.entries()).map(([name, models]) => ({ name, models }));
}
