export interface ChatProvider {
  id: string;
  displayName: string;
  authMode: 'none' | 'byok-local';
  // True for engines with a download/load step (WebLLM); false for HTTP
  // providers that are ready as soon as they have a model id.
  needsModelLoad: boolean;
  capabilities: {
    streaming: boolean;
    toolCalls: boolean;
    vision: boolean;
  };
  listModels(): Promise<ModelInfo[]>;
  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  unload?(): Promise<void>;
}

/**
 * Embedding provider — separate from ChatProvider so chat-only backends
 * (WebLLM today) don't have to implement it. A single provider class may
 * implement both interfaces (OpenAICompatibleProvider does).
 */
export interface EmbeddingProvider {
  readonly id: string;
  embed(params: EmbeddingParams): Promise<EmbeddingResult>;
  listEmbeddingModels(): Promise<EmbeddingModelInfo[]>;
}

export interface EmbeddingParams {
  modelId: string;
  inputs: string[];
  signal?: AbortSignal;
}

export interface EmbeddingResult {
  vectors: Float32Array[];
  /** Dimensionality of the returned vectors. */
  dim: number;
  /** Echo back the model used — providers may normalize the id. */
  modelId: string;
}

export interface EmbeddingModelInfo {
  id: string;
  displayName: string;
  family: string;
  /** Output dimension; 0 if not advertised by the provider. */
  dim: number;
  /** True when calling this model sends text off-device (cloud API). */
  offDevice: boolean;
}

/**
 * Reasoning capability of a model:
 * - `'effort'` — supports off/low/medium/high (OpenAI o-series)
 * - `'toggle'` — supports on/off only (Qwen3, QwQ, DeepSeek-R1)
 * - `undefined` — no reasoning support
 */
export type ReasoningCapability = 'effort' | 'toggle';

export interface ModelInfo {
  id: string;
  displayName: string;
  family: string;
  vramRequiredMB: number;
  quantization: string;
  cached: boolean;
  vision?: boolean;
  reasoning?: ReasoningCapability;
}

export interface ChatParams {
  messages: Message[];
  modelId: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  reasoningEffort?: ReasoningEffort;
  signal?: AbortSignal;
}

export interface ChatChunk {
  delta: string;
  /** Reasoning/thinking delta from structured API fields (not in-content tags). */
  reasoning?: string;
  finishReason?: 'stop' | 'length' | 'error';
  usage?: UsageStats;
}

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  prefillTokensPerSecond?: number;
  decodeTokensPerSecond?: number;
  /** Time to first token, in ms — measured client-side for API providers. */
  timeToFirstTokenMs?: number;
}

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image_url';
  image_url: { url: string };
  dimension?: { width: number; height: number };
}

export type ContentPart = TextPart | ImagePart;

export interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
  createdAt: number;
  usage?: UsageStats;
  /** Structured reasoning/thinking content from API providers. */
  reasoning?: string;
}

export interface Thread {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  modelParams?: ModelParams;
  systemPrompt?: string;
  /** Folder this thread belongs to; undefined means ungrouped. */
  folderId?: string;
  /**
   * Whether RAG injection is on for this thread. Overrides the global
   * `defaultRagEnabled` setting. Undefined means follow the default.
   */
  ragEnabled?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high';

export interface ModelParams {
  temperature: number;
  topP: number;
  maxTokens: number;
  presencePenalty: number;
  frequencyPenalty: number;
  contextWindow: number;
  historyMsgs: number;
  reasoningEffort: ReasoningEffort;
}

/**
 * Phase 3 — RAG knowledge base entities. Documents are ingested files,
 * chunks are their text segments, embeddings hold the vector per chunk.
 * Vectors are stored as plain number[] so IndexedDB structured clone works
 * without TypedArray quirks; convert to Float32Array for math.
 */
/**
 * A Library groups documents you want to search together. Each library
 * is pinned to one embedding model — vectors from different models can't
 * be cross-compared, so the library is the unit that owns the choice.
 * Switching a library's model requires re-embedding every document
 * inside it.
 *
 * Empty `embeddingModelId` means the library hasn't picked a model yet
 * (e.g., the auto-created "Default" library on a fresh install). The
 * first ingestion or an explicit setting commits the choice.
 */
export interface Library {
  id: string;
  name: string;
  embeddingModelId: string;
  /** Optional provider hint — handy when the same model id is served by
   *  multiple providers and we want to remember which one. */
  embeddingProviderId?: string;
  createdAt: number;
}

export interface Document {
  id: string;
  /** Which library this document belongs to. Every document lives in
   *  exactly one library. */
  libraryId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  createdAt: number;
}

export interface Chunk {
  id: string;
  documentId: string;
  /** 0-based position within the document. */
  index: number;
  text: string;
  /** Character offset of this chunk within the original document text. */
  startOffset: number;
  /** Heading breadcrumb for markdown chunks, e.g. "Intro > Setup". */
  headingPath?: string;
}

export interface EmbeddingRecord {
  /** Same as chunkId — one embedding per chunk. */
  chunkId: string;
  /** Model that produced this vector. Switching models invalidates. (D2) */
  embeddingModelId: string;
  /** Vector length; stored per-record for validation. */
  dim: number;
  vector: number[];
}

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  /** Optional short description — shown in the / menu instead of content. */
  description?: string;
  isBuiltIn: boolean;
  createdAt: number;
}

export interface SystemInfo {
  webgpu: boolean;
  deviceMemoryGB: number | null;
  cores: number | null;
  gpu: {
    info: string;
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
  } | null;
  storage: {
    quota: number;
    usage: number;
    free: number;
  } | null;
  connection: {
    effectiveType: string;
    downlink: number;
  } | null;
}

export interface LoadProgress {
  progress: number;
  text: string;
  timeElapsed: number;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export type FitResult = { fits: boolean; tight: boolean };
