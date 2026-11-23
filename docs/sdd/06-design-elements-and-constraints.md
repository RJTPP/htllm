## 6. Design Elements and Constraints

### 6.1 Design Element Catalog (Formal Definitions)

**E-1 Request engine (`hooks/useChat.ts`)**
- **Component:** `useChat`
- **Responsibility:** turns a user action (send, regenerate, edit-and-resend, continue,
  compact) into one model request; streams the reply into state and IndexedDB; enforces
  the mode rules.
- **Inputs:** thread id, history, provider and model, model params, persona prompt, RAG
  config (library ids, Automatic RAG, MCP tool ids, mode), attachments.
- **Outputs:** saved assistant messages with content, reasoning, citations, activity,
  presented files, usage and run status; budget state; compaction summaries.
- **Dependencies:** `services/agent`, `services/retrieval`, `services/workspace-tools`,
  `services/mcp`, `lib/compact`, `lib/conversation-budget`, `lib/system-context`, `data/*`.
- **Public Functions:** `useChat()` returns send, regenerate, edit, stop, continue, and
  manual compact, plus messages, budget and generating state.

**E-2 Agent loop (`services/agent.ts`)**
- **Component:** `executeChat`
- **Responsibility:** streams a reply and, when tools are given, runs the tool-call loop
  with validation, approval, timeouts, result caps, a repeated-call stop, the call cap,
  and the unknown-outcome stop.
- **Inputs:** `ChatProvider`, `ChatParams`, optional `AgentOptions` (`tools`,
  `contextWindow`, `maxCalls`, `maxResultChars`, `approve`, `timeoutMs`, and callbacks
  for activity, sources, present and budget).
- **Outputs:** an async iterable of `ChatChunk`; activity events; sources.
- **Dependencies:** `services/tools` (lookup, validation), `lib/conversation-budget`,
  `lib/token-calibration`.
- **Public Functions:** `executeChat(provider, params, opts?)`.

**E-3 Workspace tools (`services/workspace-tools.ts`)**
- **Component:** the Workspace tool set and mount.
- **Responsibility:** presents a chat's uploads, notes and attached libraries as one tree.
  It implements the file tools and functions with path rules, read-before-write, line
  windows, citations with line-to-page mapping, and the system prompt and file summary.
- **Inputs:** `WorkspaceContext` (thread id, library ids, band, message id, read
  versions), tool arguments.
- **Outputs:** tool results (`text`, `citations`, `presented`), new note versions.
- **Dependencies:** `data/workspace`, `data/documents`, `data/chunks`,
  `services/retrieval`, `services/regex-runner`, `services/js-runner`,
  `lib/workspace-text`, `lib/workspace-path`, `lib/calc`, `lib/csv-query`.
- **Public Functions:** `workspaceTools`, `workspaceReadTools`, `workspaceWriteTools`,
  `workspaceFunctionTools`, `mountWorkspace`, `workspaceSummary`, `attachedContents`,
  `hasCsv`, `WORKSPACE_PROMPT`, `WORKSPACE_TOOL_SUMMARY`.

**E-4 Workspace store (`data/workspace.ts`)**
- **Component:** workspace persistence.
- **Responsibility:** stores uploads and notes per chat with numbered versions and
  provenance. It checks the expected version on edit, and refuses writes to a chat that
  no longer exists.
- **Inputs:** thread id, path, text, pages, change kind, expected version, message id.
- **Outputs:** `WorkspaceFile` and `WorkspaceVersion` records.
- **Dependencies:** `data/db`.
- **Public Functions:** `addUpload`, `writeNote`, `listWorkspaceFiles`,
  `getWorkspaceFile`, `getWorkspaceFileById`, `getWorkspaceVersion`,
  `listWorkspaceVersions`, `countWorkspaceFiles`, `versionsByMessages`, `sourceExists`.

**E-5 Uploads (`services/workspace-upload.ts`)**
- **Component:** `uploadToWorkspace`
- **Responsibility:** checks the type and size of a user file, extracts text (pdf.js
  for PDFs, keeping page offsets), and stores it under `/uploads`.
- **Inputs:** a `File`, a thread id.
- **Outputs:** a `WorkspaceFile` (upload), or an `UploadError`.
- **Dependencies:** `lib/pdf`, `lib/file-kind`, `lib/workspace-path`, `data/workspace`.
- **Public Functions:** `uploadToWorkspace`, `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_CHARS`,
  `UPLOAD_ACCEPT`.

**E-6 Retrieval (`services/retrieval.ts`, `lib/hybrid-search.ts`, `lib/rag-context.ts`)**
- **Component:** `retrieve`
- **Responsibility:** checks that a library is indexed for its embedding model, then
  embeds the query, runs hybrid search, and packs parent blocks into a context with
  citations.
- **Inputs:** library id, query, abort signal, character budget.
- **Outputs:** `{ context, citations, reason? }`, or an error that blocks an ungrounded
  answer.
- **Dependencies:** `providers/registry` (embedding provider), `data/libraries`,
  `data/documents`, `data/chunks`, `data/embeddings`, `data/parents`; `minisearch` in
  `lib/hybrid-search`.
- **Public Functions:** `retrieve`, `citation`; in lib, `hybridSearch`,
  `invalidateHybridSearchCache`, `buildRagContext`.

**E-7 Ingest and embedding (`lib/ingest.ts`, `lib/embed-pipeline.ts`, `services/library-add.ts`)**
- **Component:** library import.
- **Responsibility:** extracts text and page offsets, splits it into child and parent
  chunks, stores the records, and embeds in batches with progress and cancellation. It
  can optionally contextualize chunks (off by default). `addToLibrary` sends a Workspace
  upload into a library and keeps its pages.
- **Inputs:** a `File`, or stored text with pages; a library id; an embedding provider
  and model; an abort signal.
- **Outputs:** document, chunk, parent and embedding records; status callbacks.
- **Dependencies:** `lib/pdf`, `lib/chunking`, `lib/contextualizer`,
  `lib/validate-embedding`, `lib/hybrid-search` (cache invalidation), `providers/registry`,
  `data/*` (`getDb` directly, see §7.2).
- **Public Functions:** `ingestFile`, `ingestText`, `embedDocument`, `embedAllDocuments`,
  `addToLibrary`.

**E-8 OpenAI-compatible provider (`providers/openai-compat/index.ts`)**
- **Component:** `OpenAICompatibleProvider`
- **Responsibility:** one adapter for every HTTP backend, configured by a spec (generic,
  Ollama, LM Studio; OpenRouter goes through the generic spec). It lists models; detects per-model tool support and
  context windows from server metadata; streams chat with tool calls and reasoning; and
  computes embeddings.
- **Inputs:** base URL, optional key, `ChatParams`, `EmbeddingParams`.
- **Outputs:** `ModelInfo[]`, `ChatChunk` stream, `EmbeddingResult`.
- **Dependencies:** `fetch`, `data/keys`, `data/settings`, `lib/reasoning`, `lib/errors`.
- **Public Functions:** `loadConfig`, `configure`, `listModels`, `detectToolSupport`,
  `detectContextWindow`, `chat`, `embed`, `listEmbeddingModels`.

**E-9 WebLLM provider and worker (`providers/webllm/`, `workers/webllm-worker.ts`)**
- **Component:** `WebLLMProvider`
- **Responsibility:** loads in-browser models in a Web Worker with progress, reuses the
  loaded model when only parameters change, and streams chat. It has no tool calls.
- **Inputs:** model id, `ChatParams`.
- **Outputs:** `LoadProgress` and `EngineStatus`, `ChatChunk` stream.
- **Dependencies:** `@mlc-ai/web-llm` (dynamic import and type-only imports on the main
  thread; the engine itself runs in the worker), `lib/errors`, WebGPU.
- **Public Functions:** `listModels`, `loadModel`, `chat`, `unload`; in `model-list`,
  `getModelList` and `groupByFamily`.

**E-10 MCP client and approvals (`services/mcp.ts`, `services/approvals.ts`)**
- **Component:** external tools.
- **Responsibility:** validates endpoints, connects over Streamable HTTP, discovers
  tools, wraps the selected ones as executable tools, and gates every call on user
  approval, with session trust for read-only tools.
- **Inputs:** an `McpConnection`, a token from the keys store, tool arguments, the
  user's choice.
- **Outputs:** tool results; approval requests for the UI.
- **Dependencies:** `@modelcontextprotocol/client`, `data/mcp`, `data/keys`,
  `services/tools`.
- **Public Functions:** `validateMcpUrl`, `inspectMcp`, `externalTools`, `toolId`,
  `approveTool`, `subscribeApprovals`, `getApproval`, `clearToolTrust`.

**E-11 Sandboxed runners (`services/regex-runner.ts`, `services/js-runner.ts`, `workers/regex-worker.ts`, `workers/js-worker.ts`, `lib/js-sandbox.ts`)**
- **Component:** deadline-bound execution.
- **Responsibility:**
  - The regex runner tests guarded model patterns off the main thread.
  - The JS runner runs `run_js` code in QuickJS: only the listed files, a memory and
    stack limit, an interrupt deadline, capped output, and termination as a backstop.
- **Inputs:** a pattern and texts; code, files, deadline and memory.
- **Outputs:** match booleans; `{ ok, output, result?, error? }`.
- **Dependencies:** `quickjs-emscripten-core`, `@jitl/quickjs-wasmfile-release-sync`.
- **Public Functions:** `testRegex`, `REGEX_DEADLINE_MS`, `runJs`, `JS_DEADLINE_MS`,
  `JS_MEMORY_BYTES`, `runScript`.

**E-12 Rendering and evidence (`components/chat/MessageView.tsx`, `MessageBody.tsx`, `lib/citations.ts`, `lib/thinking.ts`, `lib/sanitize.ts`)**
- **Component:** message rendering.
- **Responsibility:**
  - renders Markdown through the sanitizer, with code highlighting;
  - splits reasoning into the thinking section;
  - resolves citations against the answer's saved sources;
  - shows tool activity, the source list and dialog, presented-file cards, and the
    "continue" option.
- **Inputs:** a `Message` and streaming state.
- **Outputs:** DOM; source dialog; side panel open requests.
- **Dependencies:** `marked`, `dompurify` (through `lib/sanitize`), `shiki` (through
  `lib/highlight`).
- **Public Functions:** `parseThinking`, `stripThinking`, `citationIndex`,
  `renderCitationHtml`, `sanitizeHtml`.

**E-13 Persistence layer (`src/data/`, `lib/export.ts`)**
- **Component:** stores, migrations, cascades, backup.
- **Responsibility:** owns the DB v10 schema and its migrations; CRUD per store; the
  atomic thread-delete cascade; storage statistics, clears and reset; validated export
  and import.
- **Inputs:** records, ids, a backup JSON.
- **Outputs:** records; a backup file; validation errors.
- **Dependencies:** `idb`; `lib/export` also uses `services/approvals` (clearing tool
  trust on import) and `lib/hybrid-search` (cache invalidation).
- **Public Functions:** `getDb`, `STORE_NAMES`, per-store functions (for example
  `createThread`, `deleteThreadCascade`, `addMessage`, `writeNote`), `getStoreStats`,
  `clearStore`, `resetEverything`, `exportAllData`, `importAllData`, `validateImport`.

**E-14 App shell (`components/App.tsx` and navigation)**
- **Component:** `App`
- **Responsibility:**
  - page switching (chat, knowledge, storage) and the thread list;
  - the drawer on narrow windows;
  - the model picker, settings and command palette;
  - the mode chooser on empty chats;
  - the thread-switch lock during generation.
- **Inputs:** user navigation, hook state.
- **Outputs:** rendered pages; thread and folder mutations.
- **Dependencies:** all hooks; components.
- **Public Functions:** none outside React (the page root).

### 6.2 Interfaces and Data Structures

- **`ChatChunk`:** `{ delta, reasoning?, reasoningField?, toolCalls?, usage?,
  finishReason? }`. A provider must stream deltas in order, and report tool calls with
  a stable `index` and `id`.
- **`ExecutableTool`:** a `ToolDefinition` (`name`, `description`, JSON Schema
  `parameters`, optional `server` and `readOnlyHint`) plus
  `execute(args, signal, maxChars)`. External tools carry `server`. Built-in Workspace
  tools don't, and are never listed in `enabledToolIds`, which holds MCP ids only.
- **`SourceCitation`:** `id`, `chunkId`, `documentId`, `filename` (the path, for
  Workspace), `excerpt`, and optional `headingPath`, `pageStart`/`pageEnd` and
  `lineStart`/`lineEnd`. It is saved on the message, so evidence survives document
  deletion.
- **`AgentEvent`:** `id`, `tool`, `server?`, `arguments`, `status` (approval, running,
  complete, denied, error, unknown, stopped), `result?`.
- **`PresentedFile`:** file id, path, version, caption. A card always opens that version.
- **Compatibility:**
  - DB migrations are additive and tested. DB v10 is one-way.
  - The backup format is version 1, and import rejects other versions.
  - Tool names and schemas are model-facing, so changing them means re-running the eval.
  - Source ID formats are model-facing too; the resolver stays tolerant of other
    spellings of supplied sources.

### 6.3 Relationships

| From | To | Kind | Strength |
| --- | --- | --- | --- |
| `useChat` | `executeChat` | Calls once per send | Strong |
| `executeChat` | `ChatProvider` | Uses through the interface only | Strong, replaceable |
| `executeChat` | `ExecutableTool[]` | Runs 0..cap calls per answer | Strong |
| Workspace tools | Workspace store | Reads and writes per chat, 1 chat : n files | Strong |
| Workspace tools | Retrieval | `search` over attached libraries, 0..n libraries | Weak (keyword fallback) |
| Thread | Library | n : m (primary plus extras); Chat uses the primary for RAG | Weak (a library outlives chats) |
| MCP tools | Approvals | Every call, 1 : 1 | Strong (safety) |
| Message | Workspace versions | Presented and changed versions by message id | Weak (reference) |
| WebLLM provider | WebLLM worker | One engine per tab | Strong |

### 6.4 Constraints and Assumptions

| Constraint or assumption | Risk if invalid |
| --- | --- |
| Static hosting only, with no response headers under our control (Pages). | A worker loaded from a script URL gets its policy from headers, so it has no CSP restriction on Pages (§8.2, §9). |
| HTTP model servers allow CORS from the app's origin. | The provider fails with a network error. The guide explains server settings. |
| Models that support tool calls stream them in the OpenAI format. | Workspace fails or loops. Mitigated by per-model detection, the user override, tool-call repair and the repeated-call stop. |
| A single user per browser profile; no concurrent writers across tabs. | Two tabs editing one chat can race; edits are version-checked, other writes are last-writer-wins. |
| Browser storage quota is enough for libraries and weights. | Writes fail with a quota error. The Storage page shows usage and offers clears. |
| WebGPU is present for in-browser models. | WebLLM is unavailable; HTTP models still work. |
| Model output is hostile. | Covered by the sanitizer, the CSP, code-only HTML and SVG, approvals and path rules. |
| The owner approves CSP changes and new runtime dependencies. | The rules in `CLAUDE.md` would be bypassed. |

### 6.5 Runtime State and Data Notes (Recommended)

- **Persistent data:** the IndexedDB stores (§5.6) and the WebLLM weights in the Cache
  API.
- **Runtime state:**
  - React state in hooks and components;
  - the cached BM25 index (rebuilt when the chunk count changes);
  - the session trust set for read-only MCP tools (cleared on reload);
  - the loaded WebLLM engine;
  - per-turn read versions for read-before-write.
- **Configuration:**
  - in `settings`: preferences, mode defaults and tool overrides;
  - in `keys`: API keys and MCP tokens;
  - build-time: the CSP and the base path.
- **Future evolution:**
  - Embedding uploads per chat was considered and set aside in favor of "Add to library".
  - Storing original binaries for download is deferred.
  - A pruning policy for old note versions, other than presented ones, may be needed if
    storage grows.
