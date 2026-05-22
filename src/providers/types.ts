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
