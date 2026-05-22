## 12. Component Design

### 12.1 Subsystem Responsibilities

#### Pages Subsystem

| Component | Responsibility | Collaborators |
|---|---|---|
| `BaseLayout.astro` | Shared HTML head: meta tags, CSP header, font imports, global CSS | Used by all pages |
| `index.astro` | Landing page (zero JS): project description, link to `/app` | BaseLayout |
| `app/index.astro` | App shell: mounts `<App client:only="react" />` as an Astro island | BaseLayout, App |

#### Provider Subsystem

| Component | Responsibility | Collaborators |
|---|---|---|
| `types.ts` | Defines `ChatProvider`, `ModelInfo`, `ChatParams`, `ChatChunk` interfaces | All providers implement this |
| `registry.ts` | Discovers and returns available providers | WebLLMProvider (Phase 1); more in Phase 2 |
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

#### Hooks Subsystem

| Hook | Responsibility | Collaborators |
|---|---|---|
| `useSystem` | Runs `detectSystem()` on mount, returns `SystemInfo` | `system-detect.ts` |
| `useThreads` | Thread CRUD state + active thread selection | `threads.ts`, `messages.ts` |
| `useChat` | Send/stop/streaming, multimodal message construction, IDB persistence, usage capture | `messages.ts`, `ChatProvider` |
| `useModelParams` | Merges global defaults (from settings) with per-thread overrides | `settings.ts`, active thread |

#### UI Subsystem

| Component | Responsibility | Props Summary |
|---|---|---|
| `App.tsx` | Root orchestration: state composition, layout rendering | None (root) |
| `Sidebar.tsx` | Shell for thread list + model status footer | threads, activeThreadId, loadedModel, onOpenPicker |
| `ThreadList.tsx` | Renders thread items, new/delete/switch actions | threads, activeId, onCreate, onSelect, onDelete |
| `ChatPanel.tsx` | Message list + composer, scroll management | messages, generating, modelReady, onSend, onStop |
| `MessageView.tsx` | Single message: text/images, streaming cursor, throughput stats | message, streaming, modelId |
| `Composer.tsx` | Textarea, image attach/paste, send/stop buttons | input, images, modelReady, visionSupported, onSend, onStop, onImageAttach |
| `PromptHints.tsx` | `/`-triggered dropdown with template search | query, templates, onSelect, onDismiss |
| `EmptyState.tsx` | Welcome screen with instructions | modelReady, loadedModelId |
| `ModelPicker.tsx` | Modal: search, family groups, model cards, params, status | models, loadedId, system, params, onLoad, onUnload, onEvict, onParamsChange |
| `ModelCard.tsx` | Individual model: name, VRAM, quant badge, fit/cached/loaded status | model, isSelected, isLoaded, fitStatus, onSelect, onLoad, onUnload, onEvict |
| `ModelParams.tsx` | Collapsible param controls (temperature, top_p, etc.) | params, onChange |
| `StatusPanel.tsx` | Model loading progress bar | status, progress |
| `SystemRail.tsx` | WebGPU/RAM/CPU/storage/network badges | system |
| `ImportExport.tsx` | Export/import buttons + file picker + confirmation | onExport, onImport |
| `Badge.tsx` | Tone-variant label (neutral/ok/warn/err/accent) | tone, mono, children |
| `Dot.tsx` | Small status dot | tone |
| `Modal.tsx` | Reusable modal: backdrop, centered panel, Escape dismiss | open, onClose, title, children |

### 12.2 Internal Interfaces

**useChat hook internal API:**

```typescript
function useChat(provider: ChatProvider, threadId: string) {
  return {
    messages: Message[];
    generating: boolean;
    send(text: string, images?: ChatImage[]): Promise<void>;
    stop(): void;
    clearThread(): Promise<void>;
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
