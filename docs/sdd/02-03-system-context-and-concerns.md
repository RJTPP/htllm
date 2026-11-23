## 2. System Overview

htllm is a static single-page app served as plain files. After load, the browser tab is
the whole system:
- React renders the UI on the main thread;
- Web Workers run the in-browser model engine, regex matching and user-model JavaScript;
- IndexedDB holds every thread, file, library and setting.

The app makes network requests only to endpoints the user configures, plus the WebLLM
weight host when an in-browser model is loaded.

### 2.1 Product and Runtime Context

| Actor | Role | Boundary |
| --- | --- | --- |
| User | Chats, picks a mode and model, attaches files, approves MCP calls, manages libraries and settings. | Browser UI |
| Main thread (React app) | Renders pages, runs the chat and agent loops (`useChat`, `services/agent.ts`), retrieval, ingest, compaction, and talks to IndexedDB. | Page origin, CSP from `<meta>` |
| WebLLM worker (`workers/webllm-worker.ts`) | Hosts the MLC engine on WebGPU. The main thread talks to it through web-llm's own worker protocol. | Dedicated module worker |
| Regex worker (`workers/regex-worker.ts`) | Tests model-supplied regex patterns for `grep`. It is terminated after 2 s. | Dedicated worker, created per call |
| JS worker (`workers/js-worker.ts`) | Runs `run_js` code inside a QuickJS WebAssembly interpreter with a deadline and memory limit. It is terminated if it overruns. | Dedicated worker, created per call |
| pdf.js worker | Extracts text and page offsets from PDFs on import and upload. | Worker bundled from `pdfjs-dist` |
| IndexedDB (`htllm`, DB v10) | Persists all user data in 15 stores (§5.6). | Origin storage, subject to quota |
| Cache API | Holds downloaded WebLLM weights, managed by web-llm and shown on the Storage page. | Origin storage |

The execution model is event-driven and single-user. There are no background jobs:
- Nothing runs when the tab is closed.
- Embedding and ingest run while the Knowledge page work is in progress, and can be
  cancelled.

### 2.2 External Systems and Integrations

| System | Purpose | Trust boundary and notes |
| --- | --- | --- |
| OpenAI-compatible chat servers (LM Studio, Ollama, OpenRouter, other) | Chat completions with streaming and tool calls; model lists; optional metadata (tool support, loaded context). | User-configured base URL. Requests go straight from the browser, so the server must allow CORS (and Chrome local-network access for `localhost` from an HTTPS page). An API key, if any, is sent only to its own provider. |
| Embedding endpoint (`/v1/embeddings`) | Vectors for library chunks and queries. | The same provider abstraction. A library pins one embedding model. |
| MCP servers (Streamable HTTP) | External tools in Workspace. | HTTPS, or HTTP on localhost only. No credentials, query or fragment in the URL; the bearer token is stored separately in the keys store. Every call needs approval. Results are treated as untrusted data. |
| WebLLM weight host | Downloads model weights and wasm for in-browser models. | Chosen by web-llm's model list. Weights are cached in the Cache API. |
| Static host (GitHub Pages, or any static server) | Serves `dist/`. | No server logic. Pages can't set response headers, which is why the CSP is in `<meta>` (§2.3). |

No other third-party requests are made. Fonts and icons are self-hosted, and there are no
analytics or remote logging.

### 2.3 Operating Constraints

- **No server code.** `astro build` emits a static `dist/`; no SSR adapter, no API routes.
- **CSP in `<meta>`** on every page:
  - Production allows `script-src 'self' blob: 'wasm-unsafe-eval'`, `worker-src 'self'
    blob:`, `font-src 'self'`, and `connect-src 'self' https:` plus `localhost` and
    `127.0.0.1`.
  - It forbids `eval` and `new Function`.
  - The development policy allows `unsafe-eval`, so CSP problems show only in `build`
    plus `preview`. Changing the CSP needs the owner's consent.
- **Secrets** live in IndexedDB only. They are never in localStorage, never logged, and
  never in backups.
- **Browsers:** Chrome and Edge are the 1.0.0 targets. WebLLM needs WebGPU; HTTP models
  work without it.
- **Dependencies:** exact versions only. Runtime dependencies need the owner's approval.
- **Delivery:** the integration branch `wip/release` takes one pull request per work set.
  The owner reviews the final pull request to `dev`.

## 3. Stakeholders and Design Concerns

### 3.1 Stakeholder List

| Stakeholder | Responsibility / interest |
| --- | --- |
| Owner and maintainer (@RJTPP) | Product decisions (D-n), release, CSP and dependency approval, final review. |
| End users | Private chat with their own or in-browser models; their data stays on the device; files and citations they can trust. |
| Contributors, including coding agents | Change code without breaking hard constraints; find the owning component quickly. |
| Self-hosters | Serve `dist/` from Pages or another static host; understand what leaves the device. |
| Model and MCP server operators | Their endpoint is called directly from browsers, so they need CORS and a predictable request shape. |

### 3.2 Concern Catalog

| ID | Concern | Kind | Priority | Acceptance intent |
| --- | --- | --- | --- | --- |
| C-1 | Data never leaves the device except to endpoints the user configured. | Privacy, security | Critical | No third-party request on load (browser test). Keys are excluded from backups and logs. |
| C-2 | No server, so any static host works. | Operational | Critical | `dist/` serves from Pages under a base path, and from a local static server. |
| C-3 | Model-written content can't run code or exfiltrate data. | Security | Critical | Sanitized Markdown; HTML and SVG shown as code; production CSP without eval; `run_js` guest has no host network or DOM. |
| C-4 | External actions need explicit approval, and uncertain outcomes are not retried. | Safety | Critical | Every MCP call prompts. Denied, malformed, cancelled and unknown cases are covered by deterministic tests. |
| C-5 | Citations point only to evidence actually supplied in that answer. | Correctness, trust | Critical | The resolver matches only that answer's saved sources; unknown IDs are shown as unresolved. |
| C-6 | Workspace file rules are enforced in code, not only in the prompt. | Safety | Critical | Writes only under `/notes`, no `..`, uploads and libraries read-only, a write needs a current read. |
| C-7 | Any backend fits one provider contract. | Maintainability | High | Components don't branch on provider id (known violations listed in §7.2). |
| C-8 | In-browser inference doesn't block the UI. | Performance | High | WebLLM only in its worker; streaming UI updates throttled to animation frames. |
| C-9 | Long chats and tool-heavy turns stay within the model's context. | Performance, correctness | High | Context bands, result caps, stubs for old tool results, compaction, token budget meter. |
| C-10 | Runaway work (regex, scripts, tools) can't freeze the page. | Reliability | High | Worker deadlines (2 s regex, 3 s JS), 60 s per tool, a call cap per answer, a repeated-call stop. |
| C-11 | Data survives upgrades and backups round-trip. | Data integrity | High | Additive DB migrations with tests; validated import; atomic thread delete with cascade. |
| C-12 | Users understand which models can use Workspace. | Usability | Medium | Tool support from server metadata where available, plus a user override in the picker. |
| C-13 | The UI works on narrow windows and with a keyboard. | Usability, accessibility | Medium | Drawer below 768 px; dialogs with focus return and Escape; labeled controls. |
| C-14 | Answers in Workspace are grounded and cited. | Quality | Medium (tracked, not gating) | The live eval is recorded per model (reference R-4). |

### 3.3 Non-Functional Targets (Recommended)

| Category | Target | Where enforced |
| --- | --- | --- |
| Responsiveness | At most one React flush per animation frame while streaming (≤ 60 per second). | `useChat` flush with `requestAnimationFrame` |
| Responsiveness | A model-supplied regex is stopped after 2 s; a `run_js` script after 3 s. Its worker is terminated if it doesn't answer. | `regex-runner.ts`, `js-runner.ts` |
| Bounded work | At most 12, 16 or 24 tool calls per answer, by band; 60 s per tool call; the third identical call in a row is not run. | `agent.ts`, `contextBand` |
| Context | Tool results capped at 3k, 8k or 16k characters by band, and never above the remaining budget. Automatic RAG context of at most 4,000 characters. | `agent.ts`, `useChat` |
| Input limits | Upload ≤ 25 MB and ≤ 5,000,000 extracted characters; `run_js` file input ≤ 2,000,000 characters; script memory 64 MiB. | `workspace-upload.ts`, `workspace-tools.ts`, `js-runner.ts` |
| Privacy | Zero third-party requests on page load. | Browser test "fonts are self-hosted" |
| Accessibility | Every icon-only control has an accessible name; dialogs trap focus and close on Escape. | Components; browser tests use role queries |

Quality scenario (runaway regex, C-10):
- **Stimulus:** the model calls `grep` with `regex=true` and a pattern that backtracks
  badly on a long line.
- **Environment:** production build in Chrome, a Workspace chat, a 1 MB upload.
- **Response:** the pattern guard refuses known-dangerous shapes first. Anything that
  passes runs in a worker that is terminated at the deadline. The model gets a readable
  error suggesting plain-text grep, and the page stays interactive.
- **Measurement:** the tool result arrives within about 2 s plus worker start-up, and a
  click elsewhere on the page responds during the run (browser test "a runaway grep
  pattern is stopped by its worker deadline").
