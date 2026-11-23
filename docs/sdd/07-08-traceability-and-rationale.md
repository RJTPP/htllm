## 7. Traceability

### 7.1 Requirement/Concern to Design Mapping

| Concern | Decisions | Sections | Components | Verified by |
| --- | --- | --- | --- | --- |
| C-1 Data stays on device | AD-1, AD-4, AD-22 | 2.2, 5.6 | E-8, E-13 | Browser: no third-party requests on load. Unit: keys excluded from export, credentials refused on import. |
| C-2 Static hosting | AD-1, AD-23 | 2.3, 4.2 | Pages, `BaseLayout` | `pnpm build`; browser suite against the production build. Pages base path: roadmap R4.2. |
| C-3 No code execution from model output | AD-20, AD-24 | 5.2, 5.8 | E-11, E-12 | Browser: output sanitized under the production CSP; `run_js` under CSP. Unit: sandbox has no host globals. |
| C-4 Approval, no retry on unknown | D-14, D-22, AD-25 | 5.7, 5.8 | E-2, E-10 | Eval safety scenarios S01–S05; browser: MCP writes require approval. |
| C-5 Citations only from supplied evidence | D-18 | 5.7 | E-12 | Unit: citation resolver; browser: citations survive reload and source deletion. |
| C-6 Workspace file rules in code | D-17, D-18 | 5.4, 5.8 | E-3, E-4 | Unit: workspace tools and store; browser: end-to-end read, write, present. |
| C-7 One provider contract | AD-2, AD-19 | 5.5, 5.7 | E-8, E-9 | Typecheck. Known violations in 7.2. |
| C-8 UI stays responsive | AD-3, AD-13, AD-18 | 4.2, 5.8 | E-1, E-9, E-11 | Browser: streaming follow and scroll; runaway grep. |
| C-9 Context fits | D-24, D-29, AD-26 | 5.8, 5.9 | E-1, E-2, E-3 | Unit: budget, compaction, stubs, bands; browser: continue at the cap, compaction. |
| C-10 Runaway work bounded | D-29, AD-24 | 3.3, 5.9 | E-2, E-11 | Unit: sandbox deadline and memory; browser: runaway grep. |
| C-11 Data integrity | AD-4, AD-27 | 5.6 | E-13 | Unit: migrations, cascade, import validation. |
| C-12 Which models can use Workspace | D-13, D-23 | 5.8 | E-8, E-14 | Unit: tool support detection; browser: no-tools model refused. |
| C-13 Narrow windows, keyboard | AD-28 | 5.3 | E-14 | Browser: phone-size drawer, dialog focus. |
| C-14 Grounded answers | D-15, D-16, D-18 | 5.7 | E-3, E-6 | Live eval (tracked, R-4). |

### 7.2 Coverage and Gaps

| Gap | Kind | Owner | Next action |
| --- | --- | --- | --- |
| `components/providers/ModelPicker.tsx` and `components/ui/ProviderLogo.tsx` compare against the WebLLM provider id. | Constraint violation (AD-2) | Maintainer | Move the difference into provider capabilities when either file changes. |
| `lib/ingest.ts`, `lib/embed-pipeline.ts` and `lib/export.ts` call `getDb()` directly; `lib/export.ts` imports from `services/`. | Layering slip | Maintainer | Route through the `data/` writers in a dedicated refactor. |
| `services/tools.ts` still exports `documentTools` (the v1 `list_documents`, `search_knowledge`, `read_document`), used only by its own test. | Legacy code | Maintainer | Remove it with its test. |
| The `safeRegex` comment in `lib/workspace-text.ts` says matching runs on the main thread; it now runs in the regex worker. | Stale comment | Maintainer | Update the comment. |
| Pages base path `/htllm/` and the deploy workflow. | Not built | Maintainer | Roadmap R4.2. |
| Ollama, vLLM and cloud endpoints; reasoning replay under `reasoning`. | Unverified live (mocks only) | Owner | Tracked after release; listed in release notes as expected to work. |
| Firefox and Safari. | Unqualified | Owner | Tracked after release. |
| Research answers in Workspace often cite nothing (eval R03–R05 on Gemma 4). | Quality | Maintainer | Prompt work, measured with the live eval. |
| Multi-turn answer quality with stubbed tool results. | Unmeasured | Owner | Check a long research chat by hand. |
| Chat-mode Automatic RAG in the live eval. | Not run in the 2026-11-23 baseline (no embedding model loaded). | Owner | Run with an embedding model. |
| WebLLM in Workspace. | Deferred | Owner | Needs web-llm 0.2.85+ and custom tool-call parsing (§8.2). |
| Cross-tab coordination. | Deferred | — | Only if users report conflicts. |

## 8. Design Rationale

### 8.1 Key Decisions

**Product decisions (2026-11-23, owner).** The IDs are stable, because code comments
cite them.

| ID | Decision |
| --- | --- |
| D-1 | htllm stays a chat app first. It is not a coding agent: no shell, and no long autonomous loops. |
| D-2 | Two modes: **Chat** (any model, including small WebLLM models) and **Workspace** (models that can call tools). |
| D-3 | The mode is chosen for a new chat and cannot be switched midway. |
| D-4 | New chats start in Chat. The new-chat screen shows the mode choice explicitly. |
| D-5 | Each chat has its own Workspace: a virtual folder used as a scratchpad and for input and output. It is not a runtime. |
| D-6 | Small functions are allowed only if they are easy and safe in the browser. |
| D-7 | The Knowledge library stays, reframed as the global layer above the per-chat workspaces. |
| D-8 | The reference product is ChatGPT web's normal chat with files, not its agent or work mode. |
| D-9 | The UI reskin is done; no further visual overhaul is planned. |
| D-10 | Chat mode has no tools. Document tools and MCP move to Workspace. Chat keeps Automatic RAG. |
| D-11 | Existing chats with tools on become Workspace on upgrade; all others become Chat. |
| D-12 | The mode can change while the chat is empty, and locks at the first message. |
| D-13 | Workspace is offered only with tool-capable HTTP models until WebLLM function calling is proven. |
| D-14 | Workspace means tools are on; there is no "use tools" switch. MCP tools are selected per chat and approved per call. |
| D-15 | Automatic RAG in Workspace becomes on-demand `search` over the same hybrid engine; nothing is injected automatically. |
| D-16 | Two search tools: `search` (by meaning and keywords) and `grep` (exact text or pattern, with line numbers). |
| D-17 | The model creates and edits its own notes without approval. Uploads and library documents are read-only. `copy_file` copies a file or line range into notes. |
| D-18 | Reads of uploads and library documents can be cited, with line ranges mapped to pages. Notes, copies included, are never evidence. |
| D-19 | Regenerate and edit-and-resend leave files as they are. The user is warned that file changes from removed turns remain. |
| D-20 | Deleting a chat deletes its workspace files; the confirmation counts them. Library documents are never affected. |
| D-21 | Each mode has its own default model; switching mode on the empty chat swaps the model. |
| D-22 | MCP stays separate from files. Results stay in the conversation; the model may write notes about them. |
| D-23 | Tool support is read from server metadata where available (LM Studio, Ollama, OpenRouter). Otherwise a model is assumed capable, and the user can mark it "tools" or "no tools". |
| D-24 | The Workspace call cap scales with context (about 16–24 calls), read sizes scale too, and "continue" is offered at the cap. |
| D-25 | The model hands a file to the user with `present_file(path, caption?)`. Plain writes are quiet and only listed in the Files panel. |
| D-26 | A presented file is a card in the reply; clicking it opens a side panel viewer next to the chat. |
| D-27 | Markdown uses the sanitized renderer, CSV is a table, JSON is pretty-printed, and code and text get line numbers. HTML and SVG are shown as code, never rendered. Everything can be downloaded. |
| D-28 | Each card opens the version presented at that time. The viewer navigates between versions. |
| D-29 | Three context bands: up to 8k (120 lines or 3k characters per read, 12 calls); 8k–32k (250 lines or 8k, 16 calls); over 32k (400 lines or 16k, 24 calls). Reads end with a "continue" hint, and the budget guard still applies. |
| D-30 | All eight built-in file tools ship in the first Workspace version, `edit_file` included; trim later if the eval shows small models struggle. |
| D-31 | Copies remember their source ("copied from /library/x.pdf, lines 40–90 (p. 3–4)"). A copy is still not citable. |

The 1.0.0 work added, with the owner's approval:
- a system context line: today's date, and in Chat mode a note that the chat has no tools;
- "Add to library" from the Files panel;
- the narrow-window drawer;
- self-hosted fonts;
- the icon set;
- QuickJS `run_js`.

**Architectural decisions.** These were re-checked against the code for 1.0.0. AD-1 to
AD-19 carry over from v0.2.0 where they still hold, and AD-20 onward are new.

| ID | Decision | Rationale | Consequence |
| --- | --- | --- | --- |
| AD-1 | Static-only output; no SSR adapter. | Makes "no server" structural. | All routes are known at build time (landing and app). |
| AD-2 | `ChatProvider` is the only backend contract; components don't branch on provider id. | Adding a backend means adding a provider, not touching UI. | Two known violations (§7.2). |
| AD-3 | WebLLM runs in a dedicated Web Worker, using web-llm's own worker protocol. | Keeps inference off the main thread with no lifecycle machinery. | One engine per tab; the protocol follows the pinned library version. |
| AD-4 | All persistence in IndexedDB through `idb`; nothing in localStorage. | Capacity, structure, async access, binary support. | Cascades and migrations are our code (`data/db.ts`). |
| AD-5 | No state library; React state and hooks. | Small surface; persistence lives in IndexedDB. | `App.tsx` (about 1,000 lines) and `useChat` (about 960) are large. New logic goes into services and small hooks instead. |
| AD-6 | Streaming as `AsyncIterable` with `AbortSignal`. | Composes with the agent loop and cancellation. | Callback APIs are wrapped. |
| AD-9 | Reload a WebLLM model only when its id changes. | Parameters apply at inference time. | No reload on temperature changes. |
| AD-10 | Per-thread model params over global defaults. | Experimentation per conversation. | Two-level resolution. |
| AD-11 | Named exports in `lib`, `providers`, `data`, `services`. | Easier to trace and refactor. | Components may default-export. |
| AD-13 | Streaming state flushed once per animation frame. | Avoids render storms at high token rates. | Up to 16 ms of display delay. |
| AD-14 | Code highlighting cached per block. | No re-highlight on every render. | The cache grows with unique blocks for the tab's lifetime. |
| AD-15 | Thread switching is locked during generation. | Removes a class of stream and state races. | The user stops the reply before switching. |
| AD-16 | Accent color as a CSS custom property consumed by Tailwind. | Runtime theming without a rebuild. | — |
| AD-17 | Cache API size estimated by sampling. | Measuring multi-gigabyte caches exactly is slow. | Sizes are approximate. |
| AD-18 | `@mlc-ai/web-llm` loaded by dynamic import, never statically on the main thread. | Keeps the main bundle small. | First load pays the import. |
| AD-19 | One spec-driven `OpenAICompatibleProvider` for every HTTP backend. | One code path for all OpenAI-compatible servers. | Server differences live in specs and detection methods. |
| AD-20 | Model output is rendered with `marked` through DOMPurify. HTML and SVG files are shown as code. | Model text is hostile input. | No live HTML previews. |
| AD-21 | A services layer (`src/services/`) between hooks and providers. | Agent, tools, retrieval and MCP are testable without React. | One more layer to respect in imports. |
| AD-22 | The Workspace is our own IndexedDB store of text records keyed by chat and path, not a filesystem library. | No dependency or CSP risk; versions and provenance come cheaply. | Text only; binaries aren't kept. |
| AD-23 | The CSP is delivered by `<meta>`, with no eval. WebAssembly is allowed, and so are blob workers. | Static hosts like Pages can't set headers. Shiki, WebLLM and QuickJS need wasm. | Workers loaded from URLs aren't covered by the page policy (see AD-24). |
| AD-24 | Model-supplied code and patterns run only in short-lived workers with deadlines. `run_js` runs inside the QuickJS interpreter, which exposes no host APIs to the guest. | Isolation comes from the interpreter, which offers the guest no `fetch`, DOM, storage, timers or messaging. This holds even though a worker on Pages isn't restricted by the page's CSP. | An escape from the interpreter would land in a worker that has network access (§9, RK-7). |
| AD-25 | MCP over Streamable HTTP only, with per-call approval, session trust only for read-only tools, and no automatic retry after an unknown outcome. | Browsers can't launch stdio servers; external side effects need a human. | Users run HTTP MCP servers or bridges themselves. |
| AD-26 | Old tool results are replaced by stubs after two turns, and reasoning is stripped from history. | Replaying full results exhausts small contexts. | The model re-reads files when it needs them again. |
| AD-30 | Within one answer's tool loop, reasoning is sent back under the field it arrived in (`reasoning_content` or `reasoning`). | Servers disagree: Ollama reads only `reasoning`; llama.cpp, and LM Studio with Gemma, use `reasoning_content`; DeepSeek-style endpoints reject tool-call turns without it. Replaying under one fixed name silently drops reasoning on some servers. | The field is stored per message. Live checks covered LM Studio only (§7.2). |
| AD-27 | Thread delete is one transaction covering messages, summaries, workspace files and versions. | No orphans after a partial failure. | Larger transactions. |
| AD-28 | Below 768 px the chat list becomes a drawer and status chips hide. | Phones and narrow windows. | Two layouts to test (there is a browser scenario). |
| AD-29 | Fonts (Geist, JetBrains Mono) are self-hosted as woff2 and never inlined as `data:` URLs. | No third-party request; works offline from the zip; `font-src 'self'` holds. | About 11 font files in `dist/`. |

AD-7, AD-8 and AD-12 from v0.2.0 are folded into others or are conventions recorded in
`CLAUDE.md`:
- AD-7, the model picker as a dialog: it is still true.
- AD-8, the library-managed worker protocol: folded into AD-3.
- AD-12, Conventional Commits: a convention.

### 8.2 Alternatives Considered

| Decision | Alternative | Why rejected |
| --- | --- | --- |
| Chat vs Workspace per chat (D-2, D-3) | One mode with a tools toggle (v1) | Users could flip mid-chat into states the model can't handle. The v1 eval compared RAG with an agent, which mixed two strategies. A locked mode keeps history consistent. |
| Workspace as a store (AD-22) | A filesystem library (ZenFS, memfs, OPFS) or `just-bash` | More bundle and CSP risk for features we don't need (shell, processes). |
| `run_js` in QuickJS in a worker (AD-24) | A sandboxed iframe with its own CSP; Pyodide; `new Function` | The iframe path needs an `<iframe sandbox>` document with its own policy, and some browser behavior is unverified. Pyodide is very large, and its interrupt needs `SharedArrayBuffer`, which needs headers. `new Function` is forbidden by the CSP and has full page access. QuickJS gives an interpreter-level boundary with deadline and memory limits for 232 KB gzipped. |
| Workspace for WebLLM (D-13) | web-llm 0.2.83 native `tools` | It works for five 7–8B Hermes models only, forces every reply into a JSON array of calls, rejects custom system prompts, and fits one or two rounds in 4k context. A workable route is custom parsing with `structural_tag`, which needs 0.2.85+; it is deferred. |
| Tool support detection (D-23) | Trust every HTTP model; or keep a hard-coded allowlist | Trusting fails with unclear errors on models without tools. An allowlist goes stale. Server metadata plus a user override covers both cases. |
| On-demand search in Workspace (D-15) | Inject Automatic RAG in Workspace too | It wastes context and duplicates what `search` gives on demand. |
| Native OpenAI and Anthropic providers | Direct API clients | Their APIs refuse browser CORS; the OpenAI-compatible provider covers CORS-enabled gateways. |
| Search by meaning over uploads | Per-chat embeddings for uploads | It needs a second chunk and embedding pipeline per chat. "Add to library" reuses the existing one and keeps PDF pages. |
| Hosting | A server-backed app, or a desktop wrapper | Contradicts "no server". Pages plus a zip covers online and offline use. |

### 8.3 Tradeoff Analysis

| Decision | Security / privacy | Performance | Complexity | Capability |
| --- | --- | --- | --- | --- |
| Client-only, IndexedDB (AD-1, AD-4) | Best: nothing leaves the device by default. | Limited by the device and quota. | Migrations and backups are ours. | No sync. |
| Locked modes (D-2, D-3) | Tools exist only where chosen. | Chat avoids the tool overhead. | Two request paths in `useChat`. | Can't add tools to an existing Chat; start a Workspace instead. |
| Context bands (D-29) | — | Predictable cost on small models. | Three limit sets to test. | Big documents need more calls ("continue"). |
| `<meta>` CSP (AD-23) | Strong for the page, weaker for URL-loaded workers. | wasm allowed. | No header config needed. | Works on any static host. |
| QuickJS (AD-24) | Interpreter boundary plus deadline and memory. | Wasm start-up of a few hundred ms per call. | One worker and two pinned packages. | Computation over files, but no writes and no network. |
| Approvals (AD-25) | Human in the loop for every external call. | User latency. | The prompt UI and a trust set. | Unattended MCP workflows aren't possible, by design. |
| Stubbing old results (AD-26) | — | Large context savings. | The model must re-read files. | Multi-turn quality is unmeasured (§7.2). |
