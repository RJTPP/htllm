## 12. Component Design

### 12.1 Subsystem Responsibilities

#### Pages Subsystem

| Component | Responsibility | Collaborators |
|---|---|---|
| `BaseLayout.astro` | Shared HTML head: meta tags, CSP header, font imports, global CSS | Used by all pages |
| `index.astro` | Landing page: animated boot sequence, accent color from IDB, first-visit detection | BaseLayout |
| `app/index.astro` | App shell: mounts `<App client:only="react" />` as an Astro island | BaseLayout, App |

#### Provider Subsystem

| Component | Responsibility | Collaborators |
|---|---|---|
| `types.ts` | Defines `ChatProvider`, `ModelInfo`, `ChatParams`, `ChatChunk` interfaces | All providers implement this |
| `registry.ts` | Discovers and returns available providers | WebLLMProvider, OpenAI-compat providers |
| `openai-compat/index.ts` | OpenAI-compatible provider: streaming SSE, BYOK auth, TTFT tracking, reasoning detection | `registry.ts`, `keys.ts` |
| `webllm/index.ts` | WebLLM provider: creates worker, manages model load/unload, adapts WebLLM API to `ChatProvider` | `webllm-worker.ts`, `model-list.ts` |
| `webllm/model-list.ts` | Filters, sorts, and groups models from `prebuiltAppConfig`. Parses family names and quantization badges from model IDs. | `@mlc-ai/web-llm` |

#### Worker Subsystem

| Component | Responsibility | Collaborators |
|---|---|---|
| `webllm-worker.ts` | Hosts `MLCEngineWorkerHandler` with lazy init. Message-driven, no public API. | `@mlc-ai/web-llm` |

#### Data Subsystem

| Component | Responsibility | Collaborators |
|---|---|---|
| `db.ts` | IDB schema definition, version migration, singleton `getDb()` | `idb` library |
| `threads.ts` | Thread CRUD | `db.ts` |
| `messages.ts` | Message CRUD with threadId index | `db.ts` |
| `keys.ts` | Provider key storage (IDB only) | `db.ts` |
| `settings.ts` | User preference storage | `db.ts` |
| `prompt-templates.ts` | Prompt template CRUD + built-in seeding | `db.ts` |
| `folders.ts` | Folder CRUD | `db.ts` |
| `storage-stats.ts` | IDB store counts, Cache API enumeration + size estimation, clear/delete | `db.ts`, Cache API |
| `reset.ts` | Full data reset (all IDB stores + Cache API) | `db.ts`, Cache API |

#### Hooks Subsystem

| Hook | Responsibility | Collaborators |
|---|---|---|
| `useSystem` | Runs `detectSystem()` on mount, returns `SystemInfo` | `system-detect.ts` |
| `useThreads` | Thread CRUD state + active thread selection | `threads.ts`, `messages.ts` |
| `useChat` | Send/stop/streaming with rAF-throttled flushes, edit-and-resend, multimodal message construction, thinking/reasoning pipeline, IDB persistence, usage+timing capture, auto-title trigger | `messages.ts`, `ChatProvider` |
| `useModelParams` | Merges global defaults (from settings) with per-thread overrides | `settings.ts`, active thread |
| `useFolders` | Folder CRUD state management | `folders.ts` |

#### UI Subsystem

| Component | Responsibility | Props Summary |
|---|---|---|
| `App.tsx` | Root orchestration: state composition, layout rendering, accent color, page routing | None (root) |
| `NavRail.tsx` | Left nav: page switching (chat/storage/knowledge), model status, settings trigger | activePage, onPageChange, model info |
| `Sidebar.tsx` | Thread list with folder tree, search, new thread button | threads, folders, activeId, generating |
| `ThreadItem.tsx` | Individual thread: title, model badge, rename, delete, move to folder | thread, isActive, folders |
| `FolderSection.tsx` | Collapsible folder with nested thread items, rename/delete | folder, threads, onDrop |
| `ChatPage.tsx` | Message list + composer + system prompt bar, scroll management | messages, generating, model info |
| `MessageView.tsx` | Message: markdown body, thinking block, images, stats, copy, edit, regenerate | message, streaming, modelId |
| `MessageBody.tsx` | Markdown rendering with Shiki-highlighted code blocks | content string |
| `ThinkingBlock.tsx` | Collapsible reasoning/thinking display | content, isThinking |
| `Avatar.tsx` | User/assistant avatar with model brand icon | role, modelId, models |
| `Composer.tsx` | Textarea, image attach/paste, /-hints, send/stop, context ring | input, images, modelReady, templates |
| `PromptHints.tsx` | /command dropdown with arrow-key navigation | query, templates, onSelect |
| `SystemPromptBar.tsx` | Inline system prompt editor | prompt, onChange |
| `EmptyState.tsx` | Welcome screen with quick start instructions | modelReady, loadedModelId |
| `CommandPalette.tsx` | Cmd+K overlay: thread search + global message search | threads, onNavigate |
| `ModelPicker.tsx` | Modal: search, family groups, model cards, params, status | models, loaded, system, params |
| `ModelGridCard.tsx` | Individual model: name, VRAM, quant, fit/cached/loaded, load/delete | model, status, actions |
| `ApiModelList.tsx` | API provider model list with config shortcut | models, onLoad |
| `ParamControls.tsx` | Model parameter sliders (temperature, top_p, etc.) | params, onChange |
| `ThreadParams.tsx` | Per-thread parameter override controls | threadParams, globalDefaults |
| `StatusPanel.tsx` | Model loading progress bar | status, progress |
| `StorageManager.tsx` | Cache + IDB management: model weights, store stats, browser quota | models, loadedModelId |
| `SettingsModal.tsx` | Tabbed settings: Templates, Providers, Chat defaults, Appearance, About | tabs with sub-views |
| `ProviderConfig.tsx` | BYOK provider key + base URL configuration | provider, onSave |
| `ImportExport.tsx` | Data export/import buttons + confirmation | onExport, onImport |
| `Badge.tsx` | Tone-variant label (neutral/ok/warn/err/accent) | tone, mono, children |
| `BrandLogo.tsx` | Model family brand icon (Llama, Qwen, Phi, etc.) | family |
| `Dot.tsx` | Small status dot | tone |
| `Modal.tsx` | Reusable modal: backdrop, centered, Escape dismiss, stable height | open, onClose, title |
| `ProviderLogo.tsx` | Provider brand icon | providerId |
| `Tooltip.tsx` | Hover tooltip | content, children |
| `Landing.tsx` | Animated landing page: boot sequence, accent from IDB, first-visit redirect | None |
| `ShaderBackdrop.tsx` | WebGL noise shader background (with cleanup) | None |

### 12.2 Internal Interfaces

**useChat hook internal API:**

```typescript
function useChat(
  provider: ChatProvider,
  modelId: string,
  threadId: string | null,
  params: ModelParams,
  systemPrompt: string,
  onThreadUpdate?: (threadId: string) => void,
  onAutoTitle?: (threadId: string, firstMessage: string) => void,
) {
  return {
    messages: Message[];
    generating: boolean;
    send(text: string, images?: ChatImage[]): Promise<void>;
    stop(): void;
    regenerate(): Promise<void>;
    editAndResend(messageId: string, newText: string): Promise<void>;
  };
}
```

**useFolders hook internal API:**

```typescript
function useFolders() {
  return {
    folders: Folder[];
    create(name: string): Promise<Folder>;
    rename(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>;
  };
}
```

**useThreads hook internal API:**

```typescript
function useThreads() {
  return {
    threads: Thread[];
    activeThreadId: string | null;
    createThread(providerId: string, modelId: string): Promise<Thread>;
    selectThread(id: string): void;
    deleteThread(id: string): Promise<void>;
    updateThreadTitle(id: string, title: string): Promise<void>;
  };
}
```

**useModelParams hook internal API:**

```typescript
function useModelParams(thread: Thread | null) {
  return {
    params: ModelParams;           // merged: thread overrides > global defaults
    globalDefaults: ModelParams;
    setThreadParams(patch: Partial<ModelParams>): Promise<void>;
    setGlobalDefaults(patch: Partial<ModelParams>): Promise<void>;
  };
}
```

**WebLLMProvider internal API (beyond ChatProvider):**

```typescript
class WebLLMProvider implements ChatProvider {
  loadModel(modelId: string, onProgress: (report: LoadProgress) => void): Promise<void>;
  getLoadedModelId(): string | null;
  getEngineStatus(): 'idle' | 'loading' | 'ready' | 'error';
  // ... ChatProvider methods
}
```

### 12.3 Public/Private API Surface

| Surface | Stability | Consumers |
|---|---|---|
| `ChatProvider` interface | **Stable** — the core contract. Changes require migration of all providers. | All provider implementations, hooks, future phases |
| Repository functions (threads, messages, keys, settings) | **Stable** — adding fields is safe; changing signatures requires hook updates. | Hooks layer only |
| Hook return types | **Internal** — components depend on these but they're within the same app. | Components |
| Component props | **Internal** — free to evolve as UI changes. | Parent components |
| Worker postMessage format | **Library-owned** — `@mlc-ai/web-llm` manages this. We don't control it. | WebLLMProvider ↔ Worker |

### 12.4 Failure Handling and Retries

| Scenario | Handling |
|---|---|
| **Model load fails** (network error, WebGPU error) | Engine status set to `'error'`; `StatusPanel` shows error message. User can retry by clicking load again. No automatic retry. |
| **Streaming error** (inference crash, worker error) | Error message appended to assistant message content as `[error] ...`. Message persisted in error state. User can retry by sending again. |
| **IDB write fails** | `StorageError` thrown and caught in hook. Error displayed in UI. Messages may be lost if IDB is full — system rail warns when free storage is low. |
| **Worker crashes** | `WebWorkerMLCEngine` will fail on next `chat()` call. Provider detects error, sets status to `'error'`. User must reload the model. |
| **Abort mid-stream** | `AbortSignal` propagated to provider. WebLLM's `interruptGenerate()` called. Partial content preserved in message. |
| **Image compression fails** | Error caught; image not attached; user notified via console warning. Composer continues to work for text-only messages. |
| **Import validation fails** | Schema version mismatch detected. Import rejected with error message. No data overwritten. |
| **BYOK API auth failure** | Provider returns 401/403. Error message shown inline. User redirected to provider config to fix key. |
| **CORS error on BYOK endpoint** | Fetch fails with opaque response. Error message explains CORS requirement. User must ensure their endpoint allows browser CORS. |
| **Highlight failure** | Shiki init or highlight fails. Falls back to plain `<pre><code>` without syntax coloring. |
| **Cache delete failure** | Cache API delete fails. Error shown in StorageManager. User can retry or use browser DevTools. |
