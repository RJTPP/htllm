import type {
  ChatProvider,
  ChatParams,
  ChatChunk,
  ModelInfo,
  ContentPart,
  UsageStats,
  EmbeddingProvider,
  EmbeddingParams,
  EmbeddingResult,
  EmbeddingModelInfo,
} from '../types';
import { ProviderError } from '../../lib/errors';
import { detectReasoning } from '../../lib/reasoning';
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
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | (OpenAITextPart | OpenAIImagePart)[];
}

function toOpenAIMessage(
  role: 'user' | 'assistant' | 'system' | 'tool',
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

// Patterns used to identify embedding models when a provider's /models
// endpoint mixes chat and embedding models in one response.
const EMBEDDING_MODEL_PATTERNS = [
  /text-embedding/i,
  /-embed(-|$)/i,
  /^embed-/i,
  /nomic-embed/i,
  /^bge-/i,
  /^e5-/i,
  /gte-/i,
  /mxbai-embed/i,
  /snowflake-arctic-embed/i,
];

function isEmbeddingModelId(id: string): boolean {
  return EMBEDDING_MODEL_PATTERNS.some((re) => re.test(id));
}

/**
 * Shape we read out of /models and /embeddings/models responses. Most
 * fields are optional — different providers return different supersets of
 * the OpenAI baseline; we read what we can and ignore the rest.
 */
interface EmbeddingModelEntry {
  id: string;
  name?: string;
  architecture?: {
    output_modalities?: string[];
  };
}

/**
 * Known embedding model ids keyed by URL host. Used as a last-resort
 * fallback when a provider's discovery endpoint is unreachable from the
 * browser due to missing CORS headers (e.g. OpenRouter's
 * /v1/embeddings/models returns 200 + JSON but no Access-Control-Allow-Origin,
 * so the browser silently drops the response).
 *
 * These models are confirmed available via curl. The actual /v1/embeddings
 * POST endpoint on these hosts IS CORS-friendly, so calling the model
 * works from the browser even though listing it doesn't.
 */
const KNOWN_EMBEDDING_MODELS_BY_HOST: Record<string, string[]> = {
  'openrouter.ai': [
    'openai/text-embedding-3-small',
    'openai/text-embedding-3-large',
    'openai/text-embedding-ada-002',
    'google/gemini-embedding-001',
    'google/gemini-embedding-2-preview',
    'mistralai/mistral-embed-2312',
    'mistralai/codestral-embed-2505',
    'qwen/qwen3-embedding-4b',
    'qwen/qwen3-embedding-8b',
    'perplexity/pplx-embed-v1-0.6b',
    'perplexity/pplx-embed-v1-4b',
    'baai/bge-base-en-v1.5',
    'baai/bge-large-en-v1.5',
    'baai/bge-m3',
    'intfloat/e5-base-v2',
    'intfloat/e5-large-v2',
    'intfloat/multilingual-e5-large',
    'thenlper/gte-base',
    'thenlper/gte-large',
    'sentence-transformers/all-minilm-l6-v2',
    'sentence-transformers/all-minilm-l12-v2',
    'sentence-transformers/all-mpnet-base-v2',
    'sentence-transformers/multi-qa-mpnet-base-dot-v1',
    'sentence-transformers/paraphrase-minilm-l6-v2',
    'nvidia/llama-nemotron-embed-vl-1b-v2:free',
  ],
};

function hostFor(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export class OpenAICompatibleProvider implements ChatProvider, EmbeddingProvider {
  readonly id: string;
  readonly displayName: string;
  readonly authMode: 'none' | 'byok-local';
  readonly needsModelLoad = false;
  readonly capabilities = {
    streaming: true,
    toolCalls: true,
    // Always true for API providers — the OpenAI message format supports
    // image_url parts natively. If a model can't handle images, the API
    // returns an error which we already display. No reason to gatekeep.
    vision: true,
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
    const json = (await res.json()) as { data?: EmbeddingModelEntry[] };
    const data = Array.isArray(json.data) ? json.data : [];
    return data
      .filter((m): m is EmbeddingModelEntry => typeof m.id === 'string')
      // Hide embedding models from the chat picker. Trust the provider tag
      // when present; otherwise fall back to the id pattern.
      .filter((m) => {
        const out = m.architecture?.output_modalities;
        if (out && out.length > 0) return !out.includes('embeddings');
        return !isEmbeddingModelId(m.id);
      })
      .map((m) => ({
        id: m.id,
        displayName: m.id,
        family: parseFamily(m.id),
        vramRequiredMB: 0,
        quantization: '',
        cached: true,
        vision: true,
        reasoning: detectReasoning(m.id),
      }));
  }

  /**
   * List embedding models exposed by this endpoint.
   *
   * Discovery order:
   *   1. /embeddings/models — OpenRouter's dedicated embedding list (richer
   *      metadata: architecture.output_modalities, context_length, etc.).
   *      Other endpoints will 404 here, which is fine.
   *   2. /models — filtered by output_modalities including 'embeddings'
   *      (some providers tag embedding models in the unified list).
   *   3. /models — filtered by id pattern (text-embedding-*, nomic-embed-*,
   *      …) as the last-resort fallback.
   *
   * Providers like OpenRouter return embedding models ONLY at step 1;
   * Groq mixes them into /models at step 2-3; Ollama relies on step 3.
   */
  async listEmbeddingModels(): Promise<EmbeddingModelInfo[]> {
    if (!this.baseURL) return [];

    const fromDedicated = await this.tryDedicatedEmbeddingsEndpoint();
    if (fromDedicated && fromDedicated.length > 0) return fromDedicated;

    const fromUnified = await this.embeddingModelsFromUnifiedList();
    if (fromUnified.length > 0) return fromUnified;

    // Last resort: curated list keyed by host. Required for OpenRouter,
    // whose /v1/embeddings/models is reachable server-side but lacks CORS
    // headers so the browser drops the response.
    return this.knownEmbeddingModelsForHost();
  }

  private knownEmbeddingModelsForHost(): EmbeddingModelInfo[] {
    const host = hostFor(this.baseURL);
    if (!host) return [];
    const known = KNOWN_EMBEDDING_MODELS_BY_HOST[host];
    if (!known) return [];
    return known.map((id) => ({
      id,
      displayName: id,
      family: parseFamily(id),
      dim: 0,
      offDevice: this.spec.offDevice,
    }));
  }

  /**
   * Hit /embeddings/models. Returns null on 404 (endpoint doesn't exist) or
   * on network/parse errors — the caller then falls back to /models.
   */
  private async tryDedicatedEmbeddingsEndpoint(): Promise<EmbeddingModelInfo[] | null> {
    let res: Response;
    try {
      res = await fetch(`${this.baseURL}/embeddings/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
    } catch {
      return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) return null;
    let json: { data?: EmbeddingModelEntry[] };
    try {
      json = (await res.json()) as { data?: EmbeddingModelEntry[] };
    } catch {
      return null;
    }
    const data = Array.isArray(json.data) ? json.data : [];
    return data
      .filter((m): m is EmbeddingModelEntry => typeof m.id === 'string')
      .map((m) => ({
        id: m.id,
        displayName: m.name ?? m.id,
        family: parseFamily(m.id),
        // /models endpoints don't advertise output dimensionality —
        // discovered on first call. context_length is the input limit,
        // not the vector dim, so we don't conflate them.
        dim: 0,
        offDevice: this.spec.offDevice,
      }));
  }

  /**
   * Fall back to /models. First filter by output_modalities=['embeddings']
   * when present (precise); otherwise filter by id pattern (heuristic).
   */
  private async embeddingModelsFromUnifiedList(): Promise<EmbeddingModelInfo[]> {
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
    const json = (await res.json()) as { data?: EmbeddingModelEntry[] };
    const data = Array.isArray(json.data) ? json.data : [];
    const typed = data.filter((m): m is EmbeddingModelEntry => typeof m.id === 'string');

    // Precise path: provider tags output_modalities.
    const taggedAsEmbedding = typed.filter((m) =>
      m.architecture?.output_modalities?.includes('embeddings'),
    );
    const pool = taggedAsEmbedding.length > 0
      ? taggedAsEmbedding
      : typed.filter((m) => isEmbeddingModelId(m.id));

    return pool.map((m) => ({
      id: m.id,
      displayName: m.name ?? m.id,
      family: parseFamily(m.id),
      // /models doesn't advertise vector dim — discovered on first embed call.
      dim: 0,
      offDevice: this.spec.offDevice,
    }));
  }

  /**
   * Generate embeddings for one or more strings. Follows the OpenAI shape:
   * POST /v1/embeddings { model, input } → { data: [{ embedding: number[] }] }.
   * Returns Float32Array vectors for in-memory similarity math; stored as
   * plain number[] in IDB (see EmbeddingRecord).
   */
  async embed(params: EmbeddingParams): Promise<EmbeddingResult> {
    if (!this.baseURL) {
      throw new ProviderError(this.id, 'No base URL configured');
    }
    if (params.inputs.length === 0) {
      return { vectors: [], dim: 0, modelId: params.modelId };
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: params.modelId,
          input: params.inputs,
        }),
        signal: params.signal,
      });
    } catch (err) {
      if (params.signal?.aborted) {
        throw new ProviderError(this.id, 'Embedding aborted', err);
      }
      throw new ProviderError(this.id, this.unreachableMessage(), err);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(
        this.id,
        `HTTP ${res.status} from /embeddings${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
      );
    }

    const json = (await res.json()) as {
      data?: { embedding?: number[]; index?: number }[];
      model?: string;
    };
    const items = Array.isArray(json.data) ? json.data : [];
    // Sort by index — some providers don't guarantee response order matches
    // the input order, but always include the index field.
    items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const vectors = items
      .filter((d): d is { embedding: number[] } => Array.isArray(d.embedding))
      .map((d) => Float32Array.from(d.embedding));

    if (vectors.length !== params.inputs.length) {
      throw new ProviderError(
        this.id,
        `Embedding count mismatch: requested ${params.inputs.length}, got ${vectors.length}`,
      );
    }

    const firstVector = vectors[0];
    const dim = firstVector ? firstVector.length : 0;
    return { vectors, dim, modelId: json.model ?? params.modelId };
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    if (!this.baseURL) {
      throw new ProviderError(this.id, 'No base URL configured');
    }

    const messages = params.messages.map((m) => ({
      ...toOpenAIMessage(m.role, m.content),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.toolCalls ? { tool_calls: m.toolCalls.map((c) => ({
        id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments },
      })) } : {}),
      ...(m.toolCalls && m.reasoning ? { reasoning_content: m.reasoning } : {}),
    }));

    // Build reasoning effort params. Different providers use different fields:
    // - OpenAI o-series: `reasoning_effort` (low/medium/high)
    // - Qwen3 via Ollama/vLLM: `enable_thinking` (boolean)
    // We send both — providers that don't understand a field ignore it.
    const reasoningParams: Record<string, unknown> = {};
    if (params.reasoningEffort && params.reasoningEffort !== 'off') {
      reasoningParams.reasoning_effort = params.reasoningEffort;
      reasoningParams.enable_thinking = true;
    } else if (params.reasoningEffort === 'off') {
      reasoningParams.enable_thinking = false;
    }

    const startedAt = performance.now();
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
          ...(params.tools?.length ? {
            tools: params.tools.map((t) => ({ type: 'function', function: {
              name: t.name, description: t.description, parameters: t.parameters,
            } })),
            tool_choice: params.toolChoice ?? 'auto',
            parallel_tool_calls: false,
          } : {}),
          presence_penalty: params.presencePenalty,
          frequency_penalty: params.frequencyPenalty,
          ...reasoningParams,
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
    let firstTokenAt: number | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        if (buffer.length > 2_000_000) throw new ProviderError(this.id, 'Streaming event exceeds the size limit');

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        if (done && buffer) { lines.push(buffer); buffer = ''; }

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') return;

          let json: {
            choices?: {
              delta?: {
                content?: string;
                tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
                // DeepSeek API, OpenRouter reasoning models
                reasoning_content?: string;
                // OpenAI native reasoning (o1/o3/o4)
                reasoning?: string;
              };
              finish_reason?: string;
            }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
            error?: unknown;
          };
          try {
            json = JSON.parse(data);
          } catch {
            throw new ProviderError(this.id, 'Malformed streaming response; generation stopped.');
          }
          if (!json || typeof json !== 'object' || json.error) throw new ProviderError(this.id, 'The model endpoint reported a streaming error.');

          const choice = json.choices?.[0];
          const delta = choice?.delta;
          if (delta?.content != null && typeof delta.content !== 'string') throw new ProviderError(this.id, 'Unsupported streamed content');
          const chunk: ChatChunk = { delta: delta?.content ?? '' };
          if (delta?.tool_calls) chunk.toolCalls = delta.tool_calls.map((c) => ({
            index: c.index, id: c.id, name: c.function?.name, arguments: c.function?.arguments,
          }));

          // Structured reasoning from API (separate from content).
          const reasoning = delta?.reasoning_content ?? delta?.reasoning;
          if (reasoning) {
            chunk.reasoning = reasoning;
          }

          // Mark the first token for client-side timing measurement.
          if (firstTokenAt === null && (delta?.content || reasoning)) {
            firstTokenAt = performance.now();
          }

          const finishReason = choice?.finish_reason;
          if (finishReason === 'stop' || finishReason === 'length' || finishReason === 'tool_calls') {
            chunk.finishReason = finishReason;
          }
          if (json.usage) {
            const completionTokens = json.usage.completion_tokens ?? 0;
            const usage: UsageStats = {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens,
            };
            // The API doesn't report speed — measure it client-side.
            if (firstTokenAt !== null) {
              usage.timeToFirstTokenMs = firstTokenAt - startedAt;
              const decodeMs = performance.now() - firstTokenAt;
              if (decodeMs > 0 && completionTokens > 0) {
                usage.decodeTokensPerSecond =
                  completionTokens / (decodeMs / 1000);
              }
            }
            chunk.usage = usage;
          }
          yield chunk;
        }
        if (done) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }
}
