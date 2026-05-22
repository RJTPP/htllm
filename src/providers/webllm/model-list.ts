import { prebuiltAppConfig, hasModelInCache, ModelType } from '@mlc-ai/web-llm';
import type { ModelInfo } from '../types';

function parseFamily(modelId: string): string {
  const id = modelId.toLowerCase();
  const families: [RegExp, string][] = [
    [/llama-3\.2/i, 'Llama 3.2'],
    [/llama-3\.1/i, 'Llama 3.1'],
    [/llama-3/i, 'Llama 3'],
    [/llama-2/i, 'Llama 2'],
    [/qwen2\.5/i, 'Qwen 2.5'],
    [/qwen2/i, 'Qwen 2'],
    [/qwen3/i, 'Qwen 3'],
    [/mistral/i, 'Mistral'],
    [/gemma-2/i, 'Gemma 2'],
    [/gemma/i, 'Gemma'],
    [/phi-4/i, 'Phi 4'],
    [/phi-3\.5/i, 'Phi 3.5'],
    [/phi-3/i, 'Phi 3'],
    [/smollm2/i, 'SmolLM 2'],
    [/smollm/i, 'SmolLM'],
    [/deepseek/i, 'DeepSeek'],
    [/hermes/i, 'Hermes'],
    [/stablelm/i, 'StableLM'],
    [/tinyllama/i, 'TinyLlama'],
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
  return modelId.replace(/-MLC$/, '').replace(/-q\df\d+_\d+/, '');
}

function isChatModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    (id.includes('instruct') || id.includes('chat') || id.includes('hermes')) &&
    !id.includes('embed')
  );
}

export async function getModelList(): Promise<ModelInfo[]> {
  const list = prebuiltAppConfig.model_list ?? [];
  const chatModels = list.filter((m) => isChatModel(m.model_id));

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
