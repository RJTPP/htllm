import type { ToolDefinition, SourceCitation, AgentEvent, WireMessage } from './agent-types';
export type { ToolDefinition, ToolCall, SourceCitation, AgentEvent, WireMessage, McpConnection } from './agent-types';

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
  toolCalls?: boolean;
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
  messages: WireMessage[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
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
  finishReason?: 'stop' | 'length' | 'error' | 'tool_calls';
  toolCalls?: { index: number; id?: string; name?: string; arguments?: string }[];
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
  citations?: SourceCitation[];
  retrievalStatus?: 'grounded' | 'no-matches' | 'unavailable' | 'skipped';
  activity?: AgentEvent[];
  runStatus?: 'running' | 'complete' | 'stopped' | 'error';
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
  /** Undefined preserves legacy behavior: automatic RAG only when tools are off. */
  automaticRagEnabled?: boolean;
  agentEnabled?: boolean;
  enabledToolIds?: string[];
  /** Legacy persisted capability confirmation; no longer used to gate tools. */
  toolModelKey?: string;
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  modelParams?: ModelParams;
  systemPrompt?: string;
  /** Folder this thread belongs to; undefined means ungrouped. */
  folderId?: string;
  /**
   * Library this thread retrieves from for RAG. Three states:
   *
   *   - undefined: never explicitly chosen → use defaultLibraryId (the
   *     "inherit from settings" path). New threads start here.
   *   - null:      explicitly turned OFF for this thread. Overrides
   *     the default; RAG stays off even if defaultLibraryId is set.
   *   - string:    bound to that specific library.
   *
   * The null state is what the composer's "None" picker writes.
   * Without it, picking None would silently revert to defaultLibraryId
   * on the next render — the bug fixed in D10a.
   *
   * NOTE: `createThread()` does NOT persist `libraryId` at creation
   * time. The "inherit defaultLibraryId" behavior is implemented as a
   * runtime fallback in App.tsx — undefined falls through to the
   * default, null does not.
   *
   * Replaces the old ragEnabled boolean: library presence IS the
   * state.
   */
  libraryId?: string | null;
  /**
   * @deprecated Replaced by libraryId. Older threads may still carry
   * this flag; the runtime ignores it. Safe to remove in a future
   * migration once we're confident no users have legacy threads.
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
  /**
   * D8 Part B — Contextual Retrieval (Anthropic, 2024). When true,
   * embedding runs a chat-model pass per chunk to generate a 50-100
   * token "situating" blurb (parent doc context + section), prepends
   * it to the chunk text, then embeds the result. The chunk text in
   * IndexedDB stays clean — only the *vector* reflects the blurb.
   *
   * Trade-off: significantly slower indexing (one LLM call per chunk)
   * for 35-49% retrieval failure reduction per Anthropic's evals.
   * Defaults to false; the create/edit UI surfaces the cost upfront.
   *
   * Requires (a) chunks with a `parentId` (D8 Part A hierarchical
   * chunking) — legacy flat chunks are silently skipped during embed
   * — and (b) a chat model loaded/configured at embed time.
   */
  useContextualRetrieval?: boolean;
  createdAt: number;
}

export interface Document {
  /** Exact extracted text for sequential reading; absent on older imports. */
  extractedText?: string;
  pages?: { page: number; start: number; end: number }[];
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
  pageStart?: number;
  pageEnd?: number;
  id: string;
  documentId: string;
  /** 0-based position within the document. */
  index: number;
  text: string;
  /** Character offset of this chunk within the original document text. */
  startOffset: number;
  /** Heading breadcrumb for markdown chunks, e.g. "Intro > Setup". */
  headingPath?: string;
  /**
   * Hierarchical chunking (D8): the larger "parent" chunk this child
   * belongs to. Children are what gets embedded + retrieved; parents
   * are what gets returned to the LLM for context. Undefined on legacy
   * (flat) chunks — retrieval falls back to using the chunk's own text.
   */
  parentId?: string;
}

/**
 * Parent chunk in the hierarchical chunking scheme (D8). One parent spans
 * several child Chunks. Children are embedded and searched; parents are
 * fetched and returned to the LLM. Stored in its own IDB store so we can
 * keep children small (good retrieval precision) without bloating the
 * chunks table with redundant parent copies.
 */
export interface ParentChunk {
  pageStart?: number;
  pageEnd?: number;
  id: string;
  documentId: string;
  /** 0-based position within the document. */
  index: number;
  text: string;
  /** Character offset within the original document text. */
  startOffset: number;
  /** Heading breadcrumb for markdown parents, e.g. "Intro > Setup". */
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

/**
 * D10b — conversation compaction summary.
 *
 * When the sliding window would drop older messages (auto mode), the
 * dropped portion is summarized by a chat-model call and persisted
 * here. The summary is reinjected as a `<summary>` block in subsequent
 * requests so the model still has the gist of older turns without
 * paying their full token cost.
 *
 * One *active* summary per thread at a time — re-compaction REPLACES
 * the prior summary rather than stacking (stacked summaries decay
 * quality multiplicatively per Codex / Anthropic guidance). Older
 * summaries stay in the store for the UI's "show previous summaries"
 * view but are not used in prompt construction.
 */
export type SummaryKind = 'history' | 'tail';

export interface ConversationSummary {
  id: string;
  threadId: string;
  /** Which block this summary feeds. 'history' = older turns folded as
   *  the conversation grows. 'tail' = a recent user+assistant exchange
   *  that was itself too large to keep verbatim, summarized into its own
   *  separate block. At most one active row per (thread, kind). Absent on
   *  legacy rows — treated as 'history'. */
  kind: SummaryKind;
  /** The summary text the model produced (no XML wrappers). */
  text: string;
  /** Message ids replaced by this summary, in original order. They
   *  stay in the messages store — only the prompt excludes them. */
  replacedMessageIds: string[];
  /** Estimated token totals at compaction time (for the UI divider). */
  replacedTokens: number;
  summaryTokens: number;
  /** Did the user trigger this with the manual "Compact now" button,
   *  or did the auto-compact threshold fire? */
  source: 'auto' | 'manual';
  /** Re-compaction counter on the thread. The first summary is 1,
   *  subsequent replacements increment. We warn at 3 and hard-stop at
   *  5 — quality decays multiplicatively. */
  generation: number;
  createdAt: number;
  /** False when superseded by a newer summary. The runtime only ever
   *  uses the latest active summary per thread; older rows are kept
   *  for diagnostics / future UI. */
  active: boolean;
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
