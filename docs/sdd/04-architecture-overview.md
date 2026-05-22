## 4. Architecture Overview

### 4.1 Logical Architecture

htllm is organized in five layers. Dependencies flow strictly downward — upper layers may import from lower layers but never the reverse.

```
┌─────────────────────────────────────────────────────┐
│  Pages Layer                                        │
│  Astro pages: index.astro, app/index.astro          │
│  Static HTML shells that mount React islands        │
├─────────────────────────────────────────────────────┤
│  Component Layer                                    │
│  React components: App, Sidebar, ChatPanel,         │
│  ModelPicker, SystemRail, Composer, etc.            │
│  Consumes hooks; never imports providers directly   │
├─────────────────────────────────────────────────────┤
│  Hooks Layer                                        │
│  useSystem, useThreads, useChat, useModelParams     │
│  Bridges components ↔ data layer ↔ providers        │
├─────────────────────────────────────────────────────┤
│  Provider Layer                                     │
│  ChatProvider interface + registry                  │
│  WebLLM provider (Phase 1)                          │
│  Ollama, LM Studio, Groq, OpenRouter (Phase 2)     │
├─────────────────────────────────────────────────────┤
│  Data Layer                                         │
│  IndexedDB via idb: threads, messages, keys,        │
│  settings, promptTemplates                          │
├─────────────────────────────────────────────────────┤
│  Worker Layer                                       │
│  Web Worker: WebLLM engine (MLCEngineWorkerHandler) │
│  Communicates with Provider Layer via postMessage    │
└─────────────────────────────────────────────────────┘
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

```
┌──────────────────────────────────────────────────────┐
│  Static Host (GitHub Pages / Netlify / localhost)     │
│  Serves: HTML, JS bundles, CSS, fonts                │
│  No server logic, no API routes                      │
└──────────────┬───────────────────────────────────────┘
               │ HTTP GET (static files only)
               ▼
┌──────────────────────────────────────────────────────┐
│  Browser (Chrome 113+ / Edge 113+)                   │
│                                                      │
│  ┌─────────────────┐    postMessage    ┌───────────┐ │
│  │  Main Thread     │◄───────────────►│ Web Worker │ │
│  │  Astro + React   │                 │ WebLLM     │ │
│  │  UI + State      │                 │ Engine     │ │
│  └────────┬─────────┘                 └─────┬──────┘ │
│           │                                  │       │
│           ▼                                  ▼       │
│  ┌─────────────────┐              ┌─────────────────┐│
│  │  IndexedDB       │              │  WebGPU         ││
│  │  Threads, Msgs,  │              │  GPU inference  ││
│  │  Keys, Settings  │              │                 ││
│  └─────────────────┘              └─────────────────┘│
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Network (outbound only, user-initiated)         │ │
│  │  • HuggingFace CDN — model weight downloads      │ │
│  │  • Google Fonts — font files                     │ │
│  │  • Provider APIs (Phase 2) — BYOK, user-config'd│ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Runtime boundaries:**

- Main thread ↔ Worker: `postMessage` (structured clone). No shared memory.
- Main thread ↔ IndexedDB: async IDB transactions via `idb` wrapper.
- Worker ↔ WebGPU: synchronous GPU calls within the worker context.
- Browser ↔ Network: only for model downloads (HuggingFace CDN) and fonts. No telemetry. Phase 2 adds provider API calls (BYOK, user-initiated only).

### 4.3 Critical Flow Summary

**End-to-end: User sends a message with WebLLM provider**

```
1. User types message in Composer, presses Enter
2. useChat hook:
   a. Creates user Message record in IDB
   b. Creates placeholder assistant Message in IDB (empty content)
   c. Calls provider.chat({ messages, params }) → AsyncIterable<ChatChunk>
3. WebLLMProvider:
   a. Forwards to WebWorkerMLCEngine (built-in postMessage bridge)
   b. Worker's MLCEngineWorkerHandler runs inference via WebGPU
   c. Chunks stream back via postMessage as AsyncIterable
4. useChat hook iterates chunks:
   a. Appends delta to assistant message content (React state update)
   b. Periodically persists accumulated content to IDB
5. On stream end:
   a. Final message with usage stats persisted to IDB
   b. Thread.updatedAt updated
   c. If first message in thread, auto-generate title from content
6. UI reflects: message list scrolls, streaming cursor disappears,
   throughput stats appear below assistant message
```
