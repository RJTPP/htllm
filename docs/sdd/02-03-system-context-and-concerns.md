## 2. System Overview

htllm is a **fully client-side** static web application. There is no server, no API routes, no SSR adapter. The entire application runs in the user's browser after being served as static files from any HTTP host (GitHub Pages, Netlify, S3, localhost).

### 2.1 Product and Runtime Context

**Runtime actors:**

| Actor | Environment | Role |
|---|---|---|
| **Browser main thread** | User's browser tab | Renders UI (Astro + React), manages state, communicates with worker |
| **Web Worker** | Background thread in same origin | Runs WebLLM inference (model loading, token generation). Never touches DOM. |
| **IndexedDB** | Browser storage | Persists threads, messages, provider keys, settings, prompt templates |
| **WebGPU** | GPU via browser API | Accelerates matrix operations for LLM inference |
| **Cache API** | Browser cache storage | Stores WebLLM model weights (managed by library) |
| **Service Worker** (future) | Browser background | Offline caching of static assets (not in Phase 1 scope) |

**Execution model:**

```
Static host (any) ──serves──▶ Browser
                                ├── Main thread: Astro/React UI
                                ├── Web Worker: WebLLM engine
                                ├── IndexedDB: persistence
                                └── WebGPU: inference acceleration
```

There is no server process. The static host is interchangeable and untrusted — all logic and data lives client-side.

### 2.2 External Systems and Integrations

| External System | Purpose | Trust Boundary |
|---|---|---|
| **HuggingFace CDN** (`huggingface.co`) | Model weight downloads for WebLLM | Untrusted network; weights are validated by WebLLM library. CSP allows this origin. |
| **esm.run** | ESM module CDN (used by WebLLM internally) | Untrusted network; CSP allows this origin. |
| **Google Fonts** (`fonts.googleapis.com`, `fonts.gstatic.com`) | Geist and JetBrains Mono fonts | Untrusted network; CSP allows these origins. |
| **Ollama** (Phase 2) | Local LLM server on user's machine | User-controlled; accessed via `localhost` with CORS enabled. |
| **LM Studio** (Phase 2) | Local LLM server on user's machine | User-controlled; accessed via `localhost` with CORS enabled. |
| **Groq API** (Phase 2) | Cloud inference with user's API key | BYOK; key stored in IndexedDB, never in source. |
| **OpenRouter API** (Phase 2) | Cloud inference with user's API key | BYOK; key stored in IndexedDB, never in source. |
| **Generic OpenAI-compatible endpoint** (Phase 2) | Any server implementing `/v1/chat/completions` (user provides base URL + optional key) | User-configured; must be CORS-accessible from browser. Key in IDB if provided. Security: user is responsible for trusting their configured endpoint. |

### 2.3 Operating Constraints

| Constraint | Detail |
|---|---|
| **No server code** | `astro build` produces static `dist/`. No Node-only deps in client bundle. No SSR adapter. |
| **No secrets in source** | No API keys, tokens, or `.env` values committed. User keys live in IndexedDB only. |
| **No telemetry** | No analytics, no third-party scripts, no remote logging. |
| **Browser requirements** | Chrome 113+ or Edge 113+ (WebGPU support). Firefox/Safari have partial WebGPU support. Mobile is unsupported for in-browser inference. |
| **CSP enforcement** | `<meta http-equiv="Content-Security-Policy">` in every page `<head>`. |
| **Static output only** | `output: 'static'` in Astro config. No `hybrid` or `server` mode. |

---

## 3. Stakeholders and Design Concerns

### 3.1 Stakeholder List

| Stakeholder | Role | Primary Interest |
|---|---|---|
| **End user** | Privacy-conscious developer/enthusiast | Private local inference, no data leaving device, usable UI |
| **Contributor** | Future developer adding providers or features | Clean abstractions, documented contracts, easy onboarding |
| **Project owner** | @RJTPP | Architecture integrity, phase discipline, privacy guarantee |

### 3.2 Concern Catalog

| ID | Concern | Category | Priority | Acceptance Intent |
|---|---|---|---|---|
| C1 | **Privacy enforcement** — no user data leaves the browser unless the user explicitly configures an external provider | Security/Privacy | Critical | Architecture prevents leakage; no server, no telemetry, CSP restricts origins |
| C2 | **Provider abstraction** — adding a new LLM backend requires only a folder + registry line | Extensibility | Critical | `ChatProvider` interface is the only contract; UI is provider-agnostic |
| C3 | **Main thread responsiveness** — inference must not block UI | Performance | Critical | WebLLM runs in a Web Worker; main thread only handles messages |
| C4 | **Data persistence** — threads and messages survive page reload | Reliability | Critical | IndexedDB with `idb` wrapper; thread list and messages restored on load |
| C5 | **Secret safety** — API keys never in source, localStorage, or console | Security | Critical | Keys stored in IndexedDB `keys` store only; never logged |
| C6 | **Model fit guidance** — users should know which models can run on their hardware | Usability | High | System detection + fit heuristics + visual indicators (fit/tight/too large) |
| C7 | **Streaming UX** — tokens should appear as generated | Usability | High | `AsyncIterable<ChatChunk>` in provider contract; UI appends tokens incrementally |
| C8 | **Static deployability** — `pnpm build` produces a self-contained `dist/` | Operational | Critical | Astro `output: 'static'`; no Node-only chunks in build |
| C9 | **Phase discipline** — no Phase 2+ code in Phase 1 | Process | High | Registry returns only WebLLM; no RAG/agent imports |
| C10 | **Data portability** — users can export/import all data | Usability | Medium | JSON export/import of all IDB stores |
| C11 | **Vision support** — users can attach images to messages for vision models | Usability | Medium | Multimodal content array; image compression to ≤256KB |
| C12 | **Model parameters** — users can tune temperature, top_p, etc. | Usability | Medium | Per-thread overrides + global defaults; stored in IDB |
| C13 | **Streaming performance** — rAF-throttled state flushes prevent React re-render storms during fast token generation | Performance | High | rAF batching in useChat; React.memo on MessageView, ThreadItem, Avatar |
| C14 | **Code highlighting performance** — Shiki-based syntax highlighting must not block the main thread or cause redundant work | Performance | High | Highlight result cache keyed by theme:lang:code; lazy Shiki initialization |
| C15 | **IDB schema evolution** — schema changes must migrate existing data without loss | Reliability | High | Versioned upgrade function in db.ts; each version bump adds stores/indexes non-destructively |
| C16 | **UX consistency** — visual design (accent color, typography, spacing) should be user-customizable within bounds and consistent across all screens | Usability | Medium | CSS variable `--accent` with 8 presets; persisted to IDB; landing page reads on mount |

### 3.3 Non-Functional Targets (Recommended)

| Category | Target | Measurement |
|---|---|---|
| **Initial load** | App shell renders in <2s on broadband | Lighthouse First Contentful Paint |
| **Model load progress** | Progress bar updates at least every 2s during download | Visual inspection |
| **Streaming latency** | First token appears within 500ms of generation start (model-dependent) | Timestamp delta from send to first chunk |
| **Thread switch** | Messages load from IDB in <200ms for threads with ≤500 messages | Performance.now() delta |
| **Accessibility** | All interactive elements keyboard-navigable; focus management in modals | Manual audit |
| **Streaming throughput** | rAF-throttled flushes keep render count below 60/s during fast decoding | Performance.now() delta between renders |
| **Highlight cache hit rate** | Repeated code blocks reuse cached HTML; no redundant Shiki calls | Cache hit counter in highlight.ts |

**Quality-attribute scenario (Privacy):**

- **Stimulus:** User types a message and sends it while using the WebLLM provider
- **Environment:** Normal operation, model loaded, no external provider configured
- **Response:** The message is processed entirely in the Web Worker via WebGPU. No network request is made. The message and response are stored only in IndexedDB.
- **Measurement:** Network tab shows zero requests during chat. IndexedDB inspector shows the message. No `localStorage` entries contain message content.
