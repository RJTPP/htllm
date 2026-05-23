## 6. Design Elements and Constraints

### 6.1 Design Element Catalog (Formal Definitions)

#### ChatProvider (Interface)

- **Component:** `ChatProvider`
- **Responsibility:** Abstract contract for all LLM backends. Defines how the app discovers models, sends messages, and receives streaming responses.
- **Inputs:** `ChatParams` (messages, modelId, temperature, topP, maxTokens, penalties, AbortSignal)
- **Outputs:** `AsyncIterable<ChatChunk>` (streaming deltas with optional usage stats), `ModelInfo[]` (model catalog)
- **Dependencies:** None (pure interface)
- **Public Functions:** `listModels()`, `chat(params)`, `unload?()`

#### WebLLMProvider

- **Component:** `WebLLMProvider`
- **Responsibility:** Implements `ChatProvider` using `@mlc-ai/web-llm`. Creates a Web Worker, manages model lifecycle (load/unload), translates between `ChatProvider` types and WebLLM's OpenAI-compatible API. `@mlc-ai/web-llm` is lazily imported via dynamic `import()` to keep it out of the main bundle.
- **Inputs:** `ChatParams` from hooks layer
- **Outputs:** `AsyncIterable<ChatChunk>` via WebWorkerMLCEngine; `ModelInfo[]` from `prebuiltAppConfig`
- **Dependencies:** `@mlc-ai/web-llm` (`WebWorkerMLCEngine`, lazily imported), `src/workers/webllm-worker.ts`, `src/providers/webllm/model-list.ts`
- **Public Functions:** `listModels()`, `chat(params)`, `unload()`, `loadModel(modelId, onProgress)`, `getLoadedModelId()`
- **Note:** `unload()` now terminates the worker and nulls the engine reference, ensuring full GPU memory release.

#### WebLLM Worker

- **Component:** `webllm-worker.ts`
- **Responsibility:** Background thread that hosts the WebLLM inference engine. Receives commands from main thread via postMessage (handled by library), executes GPU inference, streams results back.
- **Inputs:** postMessage events from `WebWorkerMLCEngine`
- **Outputs:** postMessage responses (model load progress, chat completion chunks)
- **Dependencies:** `@mlc-ai/web-llm` (`WebWorkerMLCEngineHandler`), WebGPU API
- **Public Functions:** None (message-driven, no public API)

#### Provider Registry

- **Component:** `registry.ts`
- **Responsibility:** Discovers available providers and returns the default. Phase 1 returns only WebLLM. Phase 2 supports Ollama, LM Studio, Groq, OpenRouter, Generic OpenAI-compatible via `OpenAICompatibleProvider`.
- **Inputs:** None
- **Outputs:** `ChatProvider[]`, default `ChatProvider`
- **Dependencies:** `WebLLMProvider`, `OpenAICompatibleProvider`
- **Public Functions:** `getProviders()`, `getDefaultProvider()`, `getProvider(id)`

#### IDB Database

- **Component:** `db.ts`
- **Responsibility:** Initializes and manages the IndexedDB database schema, migrations, and singleton connection.
- **Inputs:** None
- **Outputs:** `IDBPDatabase` instance
- **Dependencies:** `idb`
- **Public Functions:** `getDb()`

#### Thread Repository

- **Component:** `threads.ts`
- **Responsibility:** CRUD operations for thread records in IndexedDB.
- **Inputs:** Thread data (title, providerId, modelId, modelParams)
- **Outputs:** `Thread` objects
- **Dependencies:** `db.ts`
- **Public Functions:** `createThread()`, `listThreads()`, `getThread()`, `updateThread()`, `deleteThread()`

#### Message Repository

- **Component:** `messages.ts`
- **Responsibility:** CRUD operations for message records, indexed by threadId.
- **Inputs:** Message data (threadId, role, content, usage)
- **Outputs:** `Message` objects
- **Dependencies:** `db.ts`
- **Public Functions:** `addMessage()`, `getMessages()`, `updateMessage()`, `deleteMessagesForThread()`, `deleteMessagesAfter(threadId, afterTimestamp)`, `searchMessages(query)`

#### Key Store

- **Component:** `keys.ts`
- **Responsibility:** Secure storage of provider API keys in IndexedDB. Keys are never exposed to components directly — only the provider layer reads them.
- **Inputs:** Provider ID + key string
- **Outputs:** Key string (to provider layer only)
- **Dependencies:** `db.ts`
- **Public Functions:** `setKey()`, `getKey()`, `deleteKey()`

#### System Detect

- **Component:** `system-detect.ts`
- **Responsibility:** Probes browser capabilities: WebGPU availability, device memory, CPU cores, GPU adapter info, storage quota, network info.
- **Inputs:** Browser APIs (`navigator.gpu`, `navigator.deviceMemory`, `navigator.storage`, etc.)
- **Outputs:** `SystemInfo` object
- **Dependencies:** None (browser APIs only)
- **Public Functions:** `detectSystem()`

#### Model Fit

- **Component:** `fit.ts`
- **Responsibility:** Heuristic that estimates whether a model's VRAM requirement fits within the device's estimated GPU memory budget.
- **Inputs:** `vramRequiredMB` (from model), `deviceMemoryGB` (from system detection)
- **Outputs:** `{ fits: boolean, tight: boolean }`
- **Dependencies:** None
- **Public Functions:** `fitFor(vramMB, deviceMemoryGB)`

#### Export/Import

- **Component:** `export.ts`
- **Responsibility:** Serializes all IDB stores to JSON for backup; deserializes and restores from JSON.
- **Inputs:** IDB store contents (for export); JSON blob (for import)
- **Outputs:** JSON file (for export); IDB writes (for import)
- **Dependencies:** `db.ts`, all repository modules
- **Public Functions:** `exportAllData()`, `importAllData(json)`, `exportThread(threadId)`

#### App (Root Component)

- **Component:** `App.tsx`
- **Responsibility:** Root React island. Orchestrates state via hooks, composes layout (header + sidebar + chat), manages provider lifecycle.
- **Inputs:** None (root component)
- **Outputs:** Rendered UI
- **Dependencies:** All hooks, Sidebar, ChatPanel, SystemRail, ModelPicker
- **Public Functions:** None (React component)

#### Settings Repository (updated)

- **Component:** `settings.ts`
- **Responsibility:** Reads and writes user preferences in IDB. Now also stores `accentColor`, `codeTheme`, and `titleMode` settings in addition to model parameter defaults.
- **Inputs:** Settings key-value pairs
- **Outputs:** Settings object
- **Dependencies:** `db.ts`
- **Public Functions:** `getSettings()`, `updateSettings()`

#### OpenAICompatibleProvider

- **Component:** `OpenAICompatibleProvider`
- **Responsibility:** Implements `ChatProvider` for any OpenAI-compatible `/v1/chat/completions` endpoint. Supports BYOK authentication, streaming via SSE, client-side TTFT and decode speed measurement, and structured reasoning fields.
- **Inputs:** `ChatParams` from hooks layer; base URL and API key from IDB
- **Outputs:** `AsyncIterable<ChatChunk>` with timing stats; `ModelInfo[]` from provider spec
- **Dependencies:** `src/data/keys.ts`, provider spec in `registry.ts`
- **Public Functions:** `listModels()`, `chat(params)`

#### Command Palette

- **Component:** `CommandPalette.tsx`
- **Responsibility:** Global Cmd+K overlay for thread navigation and full-text message search. Uses cursor-based IDB query for search.
- **Inputs:** Keyboard shortcut (Cmd+K / Ctrl+K), user query text
- **Outputs:** Filtered thread list, matching messages with context
- **Dependencies:** `data/messages.ts` (searchMessages), `data/threads.ts`
- **Public Functions:** None (React component)

#### Folder Repository

- **Component:** `folders.ts`
- **Responsibility:** CRUD operations for folder records in IndexedDB. Folders organize threads into collapsible groups.
- **Inputs:** Folder data (name)
- **Outputs:** `Folder` objects
- **Dependencies:** `db.ts`
- **Public Functions:** `createFolder()`, `listFolders()`, `renameFolder()`, `deleteFolder()`

#### Storage Stats

- **Component:** `storage-stats.ts`
- **Responsibility:** Enumerates IndexedDB store record counts and Cache API entries with size estimation. Provides clear/delete operations for both.
- **Inputs:** IDB stores, Cache API
- **Outputs:** `StoreStats[]`, `CacheEntry[]`
- **Dependencies:** `db.ts`, Cache API
- **Public Functions:** `getStoreStats()`, `getCacheEntries()`, `deleteCache(cacheName)`, `clearStore(storeName)`

#### Highlight

- **Component:** `highlight.ts`
- **Responsibility:** Shiki-based syntax highlighting with result caching. Lazily initializes Shiki on first call. Caches HTML output keyed by `theme:lang:code` to avoid redundant highlighting.
- **Inputs:** Code string, language identifier, theme name
- **Outputs:** HTML string with syntax highlighting
- **Dependencies:** `shiki`
- **Public Functions:** `highlightCode(code, lang, theme)`, `resetHighlighter()`

#### Thinking Parser

- **Component:** `thinking.ts`
- **Responsibility:** Parses `<think>...</think>` tags from model output (used by Qwen3, DeepSeek-R1 in local mode). Extracts thinking content and clean reply text. Also provides `stripThinking()` for cleaning history context.
- **Inputs:** Raw model output string
- **Outputs:** `{ thinking: string, reply: string, isThinking: boolean }`
- **Dependencies:** None (pure function)
- **Public Functions:** `parseThinking(text)`, `stripThinking(text)`

#### Title Generator

- **Component:** `title.ts`
- **Responsibility:** Generates concise conversation titles by prompting the model. Falls back to trimming the first message on timeout (10s) or error.
- **Inputs:** `ChatProvider`, model ID, first message text
- **Outputs:** Title string or null (caller falls back to trim)
- **Dependencies:** `ChatProvider` (for inference)
- **Public Functions:** `generateTitle(provider, modelId, firstMessage)`

#### Reset

- **Component:** `reset.ts`
- **Responsibility:** Full application data reset — clears all IDB stores and Cache API caches. Used by Settings → About → Reset.
- **Inputs:** None
- **Outputs:** Void (all data cleared)
- **Dependencies:** `db.ts`, Cache API
- **Public Functions:** `resetAll()`

### 6.2 Interfaces and Data Structures

See Section 5.7 for full interface definitions (`ChatProvider`, `ChatParams`, `ChatChunk`, repository functions).

Key data structures are defined in Section 5.4 (Logical View): `Thread`, `Message`, `ContentPart`, `ModelParams`, `PromptTemplate`, `SystemInfo`, `ModelInfo`.

**Versioning:** The IDB schema uses version numbers for migrations. Phase 1 started at version 1; Phase 2 is at version 3 (v2 added `folders` store, v3 added `byUpdatedAt` and `byThreadCreated` compound indexes).

**Error types:**

```typescript
class ProviderError extends Error {
  constructor(public providerId: string, message: string, public cause?: unknown)
}

class StorageError extends Error {
  constructor(public store: string, public operation: string, message: string, public cause?: unknown)
}

class FitError extends Error {
  constructor(public modelId: string, message: string)
}
```

### 6.3 Relationships

```
App ──uses──▶ useSystem ──calls──▶ detectSystem()
App ──uses──▶ useThreads ──calls──▶ Thread Repository ──uses──▶ IDB
App ──uses──▶ useChat ──calls──▶ ChatProvider.chat() ──delegates──▶ WebLLMProvider
App ──uses──▶ useChat ──calls──▶ Message Repository ──uses──▶ IDB
App ──uses──▶ useModelParams ──calls──▶ Settings Repository ──uses──▶ IDB
App ──renders──▶ Sidebar ──renders──▶ ThreadList
App ──renders──▶ ChatPanel ──renders──▶ MessageView, Composer, PromptHints
App ──renders──▶ ModelPicker (modal) ──renders──▶ ModelCard, ModelParams, StatusPanel
App ──renders──▶ SystemRail

WebLLMProvider ──creates──▶ Web Worker
WebLLMProvider ──uses──▶ WebWorkerMLCEngine ──postMessage──▶ WebWorkerMLCEngineHandler (in worker)
WebLLMProvider ──reads──▶ prebuiltAppConfig (model catalog)

Provider Registry ──instantiates──▶ WebLLMProvider (Phase 1)
Provider Registry ──instantiates──▶ OpenAICompatibleProvider (Phase 2)

App ──uses──▶ useFolders ──calls──▶ Folder Repository ──uses──▶ IDB
App ──renders──▶ CommandPalette ──calls──▶ searchMessages ──uses──▶ IDB
App ──renders──▶ Sidebar ──renders──▶ FolderSection ──renders──▶ ThreadItem
App ──renders──▶ SettingsModal ──reads/writes──▶ Settings Repository
App ──renders──▶ StorageManager ──calls──▶ Storage Stats ──uses──▶ IDB + Cache API

MessageBody ──calls──▶ highlightCode ──uses──▶ Shiki (lazy)
useChat ──calls──▶ parseThinking / stripThinking
useChat ──calls──▶ generateTitle (via onAutoTitle callback)
```

### 6.4 Constraints and Assumptions

| Constraint | Type | Risk if Violated |
|---|---|---|
| No server code in output | Architecture | Breaks core privacy guarantee; app won't deploy to static hosts |
| No `@ts-ignore` without inline reason | Code quality | Technical debt accumulates silently |
| No `any` types | Code quality | Type safety erosion |
| Named exports only in lib/providers/data | Convention | Tree-shaking and import discoverability degrade |
| Conventional Commits | Process | Changelog generation breaks |
| Lock dependency versions (no ranges) | Stability | Unexpected breakage from upstream changes |
| CSP meta tag in every page | Security | XSS attack surface expands |
| WebGPU required for WebLLM | Runtime | Users without WebGPU cannot use in-browser inference (Phase 2 external providers are the workaround) |
| CSS accent color via variable | Visual design | Accent color hardcoded in multiple places if variable not applied |
| `@mlc-ai/web-llm` dynamic import only | Bundle size | Static import would include multi-MB module in main bundle |

**Assumptions:**

| Assumption | Risk if Wrong |
|---|---|
| `@mlc-ai/web-llm` WebWorkerMLCEngine handles postMessage protocol fully | Would need custom worker protocol |
| `idb` library is sufficient for all IDB needs (no raw IDB calls needed) | Might need raw calls for complex queries |
| 256KB image compression is sufficient quality for vision models | May need to increase; model-dependent |
| `navigator.deviceMemory` is available in target browsers | Already handled: falls back to `null`, fit shows "unknown" |

### 6.5 Runtime State and Data Notes (Recommended)

| Category | Contents |
|---|---|
| **Persistent data (IndexedDB)** | Threads, messages, provider keys, settings, prompt templates, folders |
| **Runtime state (React)** | Current thread ID, loaded model ID, engine status, system info, generating flag, input text, attached images, model picker open/closed, accent color, folders, command palette query, active page (chat/storage/knowledge), generating lock |
| **Configuration** | Tailwind theme (build-time), CSP policy (build-time), IDB schema version (code constant) |

**Future evolution note:** Phase 3 will add an `embeddings` store to IndexedDB for RAG vector data. The IDB migration system in `db.ts` supports version bumps for these additions.
