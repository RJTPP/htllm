## 4. Architecture Overview

### 4.1 Logical Architecture

htllm is organized in five layers. Dependencies flow strictly downward — upper layers may import from lower layers but never the reverse.

```mermaid
block-beta
  columns 1
  block:pages["Pages Layer"]
    p1["Astro pages: index.astro, app/index.astro"]
    p2["Static HTML shells that mount React islands"]
  end
  block:components["Component Layer"]
    c1["React components: App, Sidebar, ChatPage, ModelPicker, NavRail, CommandPalette, StorageManager, SettingsModal"]
    c2["Consumes hooks; never imports providers directly"]
  end
  block:hooks["Hooks Layer"]
    h1["useSystem, useThreads, useChat, useModelParams, useFolders"]
    h2["Bridges components ↔ data layer ↔ providers"]
  end
  block:providers["Provider Layer"]
    pr1["ChatProvider interface + registry"]
    pr2["WebLLM · OpenAI-compatible (Ollama, LM Studio, Groq, OpenRouter, Generic)"]
  end
  block:data["Data Layer"]
    d1["IndexedDB via idb: threads, messages, keys, settings, promptTemplates, folders"]
  end
  block:lib["Lib Layer"]
    l1["Pure utilities: highlight, thinking, title, format, image, fit, system-detect, model-meta, export"]
  end
  block:worker["Worker Layer"]
    w1["Web Worker: WebLLM engine (MLCEngineWorkerHandler)"]
    w2["Communicates with Provider Layer via postMessage"]
  end

  pages --> components --> hooks --> providers --> data
  hooks --> lib
  providers --> worker
```

**Layer rules:**

| Rule | Enforcement |
|---|---|
| Components never import provider SDKs directly | Code review; `@mlc-ai/web-llm` imported only in `src/providers/webllm/` and `src/workers/` |
| Components never call IndexedDB directly | All IDB access through `src/data/` repositories and `src/hooks/` |
| Provider implementations are isolated in `src/providers/<name>/` | One folder per provider; registered via single line in `registry.ts` |
| Web Worker never imports React or DOM APIs | Worker file imports only `@mlc-ai/web-llm` |
| @mlc-ai/web-llm lazily imported | Dynamic import() in provider code; main thread never imports the module synchronously |

### 4.2 Deployment and Runtime Topology

**Deployment:** Static files served from any HTTP host. No server process.

```mermaid
graph TB
  subgraph Host["Static Host (GitHub Pages / Netlify / localhost)"]
    Files["HTML, JS bundles, CSS, fonts — no server logic"]
  end

  Host -->|"HTTP GET (static files)"| Browser

  subgraph Browser["Browser (Chrome 113+ / Edge 113+)"]
    Main["Main Thread\nAstro + React\nUI + State"]
    Worker["Web Worker\nWebLLM Engine"]
    IDB["IndexedDB\nThreads, Messages\nKeys, Settings"]
    GPU["WebGPU\nGPU inference"]

    Cache["Cache API\nModel weights"]

    Main <-->|postMessage| Worker
    Main <-->|async IDB| IDB
    Main <-->|Cache API| Cache
    Worker -->|GPU calls| GPU
  end

  subgraph Network["Network (outbound only, user-initiated)"]
    HF["HuggingFace CDN"]
    Fonts["Google Fonts"]
    APIs["Provider APIs — BYOK"]
  end

  Browser -.-> Network
```

**Runtime boundaries:**

- Main thread ↔ Worker: `postMessage` (structured clone). No shared memory.
- Main thread ↔ IndexedDB: async IDB transactions via `idb` wrapper.
- Main thread ↔ Cache API: used by storage manager to enumerate and delete cached model weights.
- Worker ↔ WebGPU: synchronous GPU calls within the worker context.
- Browser ↔ Network: model downloads (HuggingFace CDN), fonts, and BYOK provider API calls (user-initiated only).

### 4.3 Critical Flow Summary

**End-to-end: User sends a message with WebLLM provider**

```mermaid
sequenceDiagram
    actor User
    participant Composer
    participant useChat as useChat Hook
    participant IDB as IndexedDB
    participant Provider as WebLLMProvider
    participant Worker as Web Worker
    participant GPU as WebGPU

    User->>Composer: Type message + Enter
    Composer->>useChat: send(text, images?)
    useChat->>IDB: addMessage(user)
    useChat->>IDB: addMessage(assistant, empty)
    useChat->>Provider: chat(params) → AsyncIterable
    Provider->>Worker: postMessage (via WebWorkerMLCEngine)
    Worker->>GPU: inference
    loop Streaming chunks
        GPU-->>Worker: tokens
        Worker-->>Provider: ChatChunk (postMessage)
        Provider-->>useChat: yield ChatChunk
        useChat-->>Composer: setState (append delta)
        Note over useChat: rAF-throttled flush (≤60 updates/s)
        useChat-->>IDB: periodic flush
    end
    Provider-->>useChat: stream end + usage stats
    useChat->>IDB: updateMessage(final content + usage)
    useChat->>IDB: updateThread(updatedAt)
    Note over useChat: Auto-generate title if first message
```

**Command palette search:**

```mermaid
sequenceDiagram
    actor User
    participant CP as CommandPalette
    participant IDB as IndexedDB

    User->>CP: Cmd+K → type query
    CP->>IDB: searchMessages(query) via cursor
    IDB-->>CP: matching messages (paginated)
    CP-->>User: results with thread context
    User->>CP: select result
    CP-->>User: navigate to thread + scroll to message
```
