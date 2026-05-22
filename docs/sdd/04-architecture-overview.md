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
    c1["React components: App, Sidebar, ChatPanel, ModelPicker, SystemRail, Composer"]
    c2["Consumes hooks; never imports providers directly"]
  end
  block:hooks["Hooks Layer"]
    h1["useSystem, useThreads, useChat, useModelParams"]
    h2["Bridges components ↔ data layer ↔ providers"]
  end
  block:providers["Provider Layer"]
    pr1["ChatProvider interface + registry"]
    pr2["WebLLM (Phase 1) · Ollama, LM Studio, Groq, OpenRouter, Generic OpenAI (Phase 2)"]
  end
  block:data["Data Layer"]
    d1["IndexedDB via idb: threads, messages, keys, settings, promptTemplates"]
  end
  block:worker["Worker Layer"]
    w1["Web Worker: WebLLM engine (MLCEngineWorkerHandler)"]
    w2["Communicates with Provider Layer via postMessage"]
  end

  pages --> components --> hooks --> providers --> data
  providers --> worker
```

**Layer rules:**

| Rule | Enforcement |
|---|---|
| Components never import provider SDKs directly | Code review; `@mlc-ai/web-llm` imported only in `src/providers/webllm/` and `src/workers/` |
| Components never call IndexedDB directly | All IDB access through `src/data/` repositories and `src/hooks/` |
| Provider implementations are isolated in `src/providers/<name>/` | One folder per provider; registered via single line in `registry.ts` |
| Web Worker never imports React or DOM APIs | Worker file imports only `@mlc-ai/web-llm` |

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

    Main <-->|postMessage| Worker
    Main <-->|async IDB| IDB
    Worker -->|GPU calls| GPU
  end

  subgraph Network["Network (outbound only, user-initiated)"]
    HF["HuggingFace CDN"]
    Fonts["Google Fonts"]
    APIs["Provider APIs — Phase 2, BYOK"]
  end

  Browser -.-> Network
```

**Runtime boundaries:**

- Main thread ↔ Worker: `postMessage` (structured clone). No shared memory.
- Main thread ↔ IndexedDB: async IDB transactions via `idb` wrapper.
- Worker ↔ WebGPU: synchronous GPU calls within the worker context.
- Browser ↔ Network: only for model downloads (HuggingFace CDN) and fonts. No telemetry. Phase 2 adds provider API calls (BYOK, user-initiated only).

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
        useChat-->>IDB: periodic flush
    end
    Provider-->>useChat: stream end + usage stats
    useChat->>IDB: updateMessage(final content + usage)
    useChat->>IDB: updateThread(updatedAt)
    Note over useChat: Auto-generate title if first message
```
