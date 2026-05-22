import type {
  ChatProvider,
  ChatParams,
  ChatChunk,
  ModelInfo,
  ContentPart,
} from '../types';
import { ProviderError } from '../../lib/errors';
import { getKey, setKey, deleteKey } from '../../data/keys';
import { getSetting, setSetting } from '../../data/settings';

// Describes one OpenAI-compatible HTTP endpoint. The same provider class is
// instantiated once per spec — BYOK cloud, Ollama, LM Studio all speak the
// same wire protocol and differ only in defaults and guidance.
export interface HttpProviderSpec {
  id: string;
  displayName: string;
  defaultBaseURL: string;
  usesKey: boolean;
  // True when requests leave this device (cloud BYOK); false for localhost
  // daemons where inference stays local.
  offDevice: boolean;
  description: string;
  // Shown to the user when the endpoint needs CORS configured to be reachable.
  corsNote?: string;
}

interface OpenAITextPart {
  type: 'text';
  text: string;
}
interface OpenAIImagePart {
  type: 'image_url';
  image_url: { url: string };
}
interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | (OpenAITextPart | OpenAIImagePart)[];
}

function toOpenAIMessage(
  role: 'user' | 'assistant' | 'system',
  content: string | ContentPart[],
): OpenAIMessage {
  if (typeof content === 'string') return { role, content };
  const parts = content.map((part) =>
    part.type === 'text'
      ? { type: 'text' as const, text: part.text }
      : { type: 'image_url' as const, image_url: { url: part.image_url.url } },
  );
  return { role, content: parts };
}

// Derive a coarse grouping label so models can be grouped in the picker.
// Handles ids like "openai/gpt-4o", "meta-llama/Llama-3.3-70B", "llama-3.3-70b".
function parseFamily(modelId: string): string {
  const id = modelId.toLowerCase();
  const families: [RegExp, string][] = [
    [/deepseek/, 'DeepSeek'],
    [/llama/, 'Llama'],
    [/qwen/, 'Qwen'],
    [/gemma/, 'Gemma'],
    [/phi/, 'Phi'],
    [/mistral|mixtral/, 'Mistral'],
    [/gpt|o1|o3|o4/, 'OpenAI'],
    [/claude/, 'Claude'],
    [/gemini/, 'Gemini'],
    [/grok/, 'Grok'],
  ];
  for (const [re, name] of families) {
    if (re.test(id)) return name;
  }
  if (modelId.includes('/')) return modelId.split('/')[0] ?? 'Other';
  return modelId.split('-')[0] ?? 'Other';
}

// Trailing slash removed so endpoints can be joined directly. The user is
// expected to supply the API root including the version segment, e.g.
// https://api.groq.com/openai/v1 or http://localhost:11434/v1.
function normalizeBaseURL(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export class OpenAICompatibleProvider implements ChatProvider {
  readonly id: string;
  readonly displayName: string;
  readonly authMode: 'none' | 'byok-local';
  readonly needsModelLoad = false;
  readonly capabilities = {
    streaming: true,
    toolCalls: false,
    vision: false,
  };
  readonly spec: HttpProviderSpec;

  private baseURL: string;
  private apiKey = '';

  constructor(spec: HttpProviderSpec) {
    this.spec = spec;
    this.id = spec.id;
    this.displayName = spec.displayName;
    this.authMode = spec.usesKey ? 'byok-local' : 'none';
    this.baseURL = spec.defaultBaseURL;
  }

  private get baseURLSettingKey(): string {
    return `provider:${this.id}:baseURL`;
  }

  /** Loads persisted base URL + key from IndexedDB. Call once on startup. */
  async loadConfig(): Promise<void> {
    const savedURL = await getSetting<string>(this.baseURLSettingKey);
    this.baseURL = savedURL ?? this.spec.defaultBaseURL;
    if (this.spec.usesKey) {
      this.apiKey = (await getKey(this.id)) ?? '';
    }
  }

  /** Persists base URL + key. Key goes to the keys store, never logged. */
  async configure(baseURL: string, apiKey: string): Promise<void> {
    this.baseURL = normalizeBaseURL(baseURL);
    await setSetting(this.baseURLSettingKey, this.baseURL);
    if (this.spec.usesKey) {
      this.apiKey = apiKey.trim();
      if (this.apiKey) {
        await setKey(this.id, this.apiKey);
      } else {
        await deleteKey(this.id);
      }
    }
  }

  getConfig(): { baseURL: string; apiKey: string } {
    return { baseURL: this.baseURL, apiKey: this.apiKey };
  }

  isConfigured(): boolean {
    return this.baseURL.length > 0;
  }

  // A failed browser fetch cannot distinguish "offline" from "CORS-blocked" —
  // the browser hides the reason — so the message names both possibilities.
  private unreachableMessage(): string {
    const base = `Could not reach ${this.baseURL} — the server may be offline or blocking browser requests.`;
    return this.spec.corsNote ? `${base} ${this.spec.corsNote}` : base;
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.baseURL) return [];
    let res: Response;
    try {
      res = await fetch(`${this.baseURL}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
    } catch (err) {
      throw new ProviderError(this.id, this.unreachableMessage(), err);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(
        this.id,
        `HTTP ${res.status} from /models${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
      );
    }
    const json = (await res.json()) as { data?: { id?: string }[] };
    const data = Array.isArray(json.data) ? json.data : [];
    return data
      .filter((m): m is { id: string } => typeof m.id === 'string')
      .map((m) => ({
        id: m.id,
        displayName: m.id,
        family: parseFamily(m.id),
        vramRequiredMB: 0,
        quantization: '',
        cached: true,
        vision: false,
      }));
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    if (!this.baseURL) {
      throw new ProviderError(this.id, 'No base URL configured');
    }

    const messages = params.messages.map((m) => toOpenAIMessage(m.role, m.content));

    let res: Response;
    try {
      res = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: params.modelId,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          temperature: params.temperature,
          top_p: params.topP,
          max_tokens: params.maxTokens,
          presence_penalty: params.presencePenalty,
          frequency_penalty: params.frequencyPenalty,
        }),
        signal: params.signal,
      });
    } catch (err) {
      if (params.signal?.aborted) return;
      throw new ProviderError(this.id, this.unreachableMessage(), err);
    }

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(
        this.id,
        `HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;

          let json: {
            choices?: { delta?: { content?: string }; finish_reason?: string }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }

          const choice = json.choices?.[0];
          const chunk: ChatChunk = { delta: choice?.delta?.content ?? '' };
          const finishReason = choice?.finish_reason;
          if (finishReason === 'stop' || finishReason === 'length') {
            chunk.finishReason = finishReason;
          }
          if (json.usage) {
            chunk.usage = {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
            };
          }
          yield chunk;
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }
}
