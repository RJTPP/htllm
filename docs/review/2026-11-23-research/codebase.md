# htllm codebase review — as-built facts, quality, drift, Workspace impact

Date: 2026-11-23. Read-only review. "Current" = `dev` (d95223f) + `feat/ui-pass` (3 commits: 2007dff, 55ef08f, e241c04).
Line refs are to `dev` unless marked **(ui-pass)**; the 16 files that differ on ui-pass (see §3.1) were read via `git show feat/ui-pass:<path>`. App.tsx line numbers are identical on both (ui-pass changes one line, 794).
Opinions are marked **[opinion]**.

---

## 1. As-built facts

### 1.1 Layers and module responsibilities

Actual layering (six layers, not five as CLAUDE.md says): Pages → Components → Hooks → **Services** → Providers + Data + Workers, with `lib/` used by every layer.

| Dir | Files (non-test) | Role |
|---|---|---|
| `src/pages/`, `src/layouts/BaseLayout.astro` | — | Static shells; CSP meta (`BaseLayout.astro:16-21`, `connect-src 'self' https: http://localhost:* http://127.0.0.1:*`, `wasm-unsafe-eval`, Google Fonts allowed) |
| `src/components/` | App.tsx + chat (17), knowledge (12), providers (7), settings (4), sidebar (3), system (3), ui (9 on ui-pass incl. new `Switch.tsx`), command, landing, nav, storage | React islands |
| `src/hooks/` | useChat (896 lines), useKnowledge (494), useThreads, useFolders, useLibraries, useModelParams, useSystem | State + orchestration |
| `src/services/` (new in v1, ~360 lines non-test) | `agent.ts` (tool loop), `tools.ts` (built-in doc tools + arg validation), `document-reader.ts` (cursor reads), `retrieval.ts` (RAG facade), `mcp.ts` (MCP client), `approvals.ts` (approval queue + session trust) | React-free execution |
| `src/providers/` | `types.ts`, `agent-types.ts`, `registry.ts`, `webllm/`, `openai-compat/` | ChatProvider/EmbeddingProvider |
| `src/data/` | db, threads, messages, keys, settings, prompt-templates, folders, libraries, documents, chunks, parents, embeddings, summaries, mcp, reset, storage-stats | IndexedDB via `idb` |
| `src/workers/webllm-worker.ts` | — | `WebWorkerMLCEngineHandler` |
| `src/lib/` | 28 non-test files | Mix of pure utils + RAG pipeline + some IDB-touching modules (see §2.4) |

Registry (`src/providers/registry.ts:12-48`): WebLLM + three `OpenAICompatibleProvider` specs (`openai-compat` generic, `ollama`, `lmstudio`). Embeddings only via HTTP providers (`registry.ts:72-78`).

### 1.2 Data model (IndexedDB `htllm`, `DB_VERSION = 9`, `src/data/db.ts:73`)

Stores (`db.ts:3-70`): `threads` (idx byUpdatedAt), `messages` (byThread, byThreadCreated), `keys`, `settings`, `promptTemplates`, `folders`, `libraries` (byCreatedAt), `documents` (byCreatedAt, byLibrary), `chunks` (byDocument, byParent), `parents` (byDocument), `summaries` (byThread), `embeddings` (key `[chunkId, embeddingModelId]`, byModel, byChunk), `mcpConnections` (keyPath id).
Migration history in `db.ts:90-214`: v4 RAG stores, v5 composite embedding key (drops v4 vectors), v6 libraries + Default backfill, v7 parents, v8 summaries, v9 mcpConnections (`db.ts:90`, placed before the `<1` block — harmless).

Key types (`src/providers/types.ts`):
- **Thread** (`:136-181`): `id, title, providerId, modelId, modelParams?, systemPrompt?, folderId?, createdAt, updatedAt`, plus v1 fields `automaticRagEnabled?` (`:138`), `agentEnabled?` (`:139`), `enabledToolIds?` (`:140`), legacy `toolModelKey?` (`:142`, "no longer used to gate tools"), `libraryId?: string | null` tri-state (`:172`), deprecated `ragEnabled?` (`:178`).
- **Message** (`:121-134`): `content: string | ContentPart[]`, `citations?: SourceCitation[]`, `retrievalStatus?: 'grounded'|'no-matches'|'unavailable'|'skipped'`, `activity?: AgentEvent[]`, `runStatus?: 'running'|'complete'|'stopped'|'error'`, `usage?`, `reasoning?`.
- **Library** (`:218-242`): `id, name, embeddingModelId ('' = unpinned), embeddingProviderId?, useContextualRetrieval?, createdAt`.
- **Document** (`:244-257`): `extractedText?` (exact text for sequential reading; absent on pre-v1 imports), `pages?: {page,start,end}[]` (char offsets into extractedText), `id, libraryId (required), filename, mimeType, sizeBytes, chunkCount, createdAt`. No line index.
- **Chunk** (`:259-278`) / **ParentChunk** (`:287-299`): `text, startOffset, index, headingPath?, pageStart?, pageEnd?, parentId?`.
- **EmbeddingRecord** (`:301-309`): `vector: number[]`, `dim`.
- **ConversationSummary** (`:328-357`): `kind: 'history'|'tail'`, `replacedMessageIds`, `generation`, `active`, `source`.
- **ModelInfo.toolCalls?** (`:65`) is declared but **never set by any provider and never read** — the unused per-model hook (alongside `toolModelKey`).
- `agent-types.ts`: `SourceCitation {id, documentId, chunkId, filename, excerpt, headingPath?, pageStart?, pageEnd?}`; `AgentEvent {id, tool, server?, arguments, status: approval|running|complete|denied|error|unknown|stopped, result?}`; `McpConnection {id, name, url, tools[]}`; `WireMessage` adds `role:'tool'`, `toolCalls`, `toolCallId`.

Ingestion: `lib/ingest.ts:69-150` — TXT/MD (FileReader) and PDF (`lib/pdf.ts`, pdfjs-dist 6.3.289 with its worker; per page `text + '\n\n'`, `pages.push({page,start,end})` `pdf.ts:25-33`). Writes document+parents+chunks in one tx **directly via `getDb()`** (`ingest.ts:143-148`). Every document must have a `libraryId`. No upload size limit found. Composer accepts images only (`Composer.tsx:310 accept="image/*"`).

### 1.3 Chat / agent execution pipeline

`useChat.runGeneration` (`src/hooks/useChat.ts:229-683`):
1. Loads active summaries; removes covered messages (`:265-276`).
2. Strips reasoning; **folds each assistant message's saved `activity` into its content as `<historical-tool-data>` JSON** via `withActivityContext` (`:281-296`, `lib/message-context.ts:6-18`). All prior tool results are therefore replayed every later turn (and into compaction input, `compact.ts` imports `activityContext`).
3. Automatic RAG if `rag.libraryId && (rag.automaticRagEnabled ?? !agent)` (`:302`) → `services/retrieval.retrieve()` with `maxChars = clamp(contextWindow, 500..4000)` (`:307-308`); failure ⇒ `retrievalStatus='unavailable'` and generation blocked (error thrown).
4. System message = `[ragBlock, <summary>, <recent-context>, systemPrompt]` (`:320-337`); budget fit / auto-compaction (`:340-560`; trigger 0.75×window, cap 5, warn 3, min window 8192 — `data/settings.ts:98-117`).
5. If `agentEnabled` (`:582-589`): throws `'Tool use requires an HTTP model.'` when `!provider.capabilities.toolCalls`; `externalTools(enabledToolIds)` connects to MCP; `tools = [...documentTools(libraryId), ...mcp]`; unshifts an agent system prompt with citation syntax `[[Source <id>]]`.
6. `executeChat` (`services/agent.ts:17-129`) loop:
   - Limits: `maxCalls` default **8 per user turn** (`:22`), tool timeout **60 s** (`:102`), streamed args ≤64 000 chars (`:53`), tool index 0..32 (`:50`).
   - Budget: `available = contextWindow − reserveForResponse(...)`; size estimate = JSON chars/4 × calibration ratio (`:29-32`); pre-trims oldest whole user turns until `size ≤ available−512` (`:33-38`); throws `'Agent context budget reached…'` mid-run if exceeded (`:45`). No in-turn compaction.
   - Result cap: `maxChars = min(8000, (available − size − 256)×4/ratio)` (`:105`); output sliced and `'[Result truncated]'` appended (`:108-109`); citations kept only if their excerpt is in the truncated text (`:110-113`).
   - Approval only for tools with `server` (MCP) (`:85-91`); denied signatures remembered per run; ambiguous MCP failure ⇒ status `unknown`, `stopTools` (`:118-119`).
   - After limit: injects user message "Tool budget reached…" and does a tools-free final pass (`:41, :46, :127`).
7. Evidence: `onSources` merges citations by id (`useChat.ts:607-611`); message persisted with `citations, activity, retrievalStatus, runStatus` at running/complete/stopped/error (`:590, :628-668`). Reload recovers `running` → `stopped`/`unknown` (`:220-221`).
8. Rendering: `lib/citations.ts` (ui-pass) resolves `[[Source X]]` only against that message's saved citations (exact id/chunkId, `id: filename`, unique filename, or 1-based index), otherwise shows "[unresolved source: …]". `MessageEvidence.tsx` (ui-pass) shows filename · p.N or headingPath and the saved excerpt; it calls `getDocument(source.documentId)` and shows "Original document unavailable" if missing.

Built-in tools (`services/tools.ts:23-44`), all scoped to **one** `libraryId`:
- `list_documents` → `[{id, filename}]`.
- `search_knowledge(query)` → `retrieve()` (hybrid BM25+cosine, parents returned, default maxChars 4000) + citations.
- `read_document(documentId, cursor)` → `readDocumentPage` (`document-reader.ts:4-38`): reads `extractedText` (or joined chunks with `originalAvailable:false` warning); **page size hard-capped at 4000 chars** (`:29`) regardless of maxChars; binary-searches to fit the serialized JSON into maxChars; cursor = `JSON{documentId, offset}`; citation id `${docId}:read:${start}-${end}` with page range from `doc.pages` overlap and heading paths from chunks; refuses cross-library reads (`tools.ts:38`).
- With no library all three return "No library selected…" (no evidence).

`retrieve()` (`services/retrieval.ts:14-26`) requires a pinned embedding model + provider and **every chunk indexed**, else throws "Knowledge unavailable…". It loads all chunks of the library and all embeddings for the model on each call.

MCP (`services/mcp.ts`): official `@modelcontextprotocol/client` 2.2.0, Streamable HTTP only; HTTPS or localhost HTTP; bearer token from `keys` store as `mcp:<id>`; no OAuth; per run reconnects and re-discovers tools, aborts the run if a selected tool definition changed (`:70-75`); tool ids `mcp_<connId>_<index>` (`:14`); only text content passed through; token redacted; **`if (tools.length !== enabledIds.length) throw`** (`:91`) — so `enabledToolIds` must contain MCP ids only.
Approvals (`services/approvals.ts`): single pending request (module-level), "trust" only for `readOnlyHint` tools, in-memory per session, cleared on import or definition change.

### 1.4 Tool capability gating

- `ChatProvider.capabilities.toolCalls` is **per provider**: WebLLM `false` (`webllm/index.ts:37-41`), all HTTP providers `true` (`openai-compat/index.ts:175-182`).
- Read in exactly two places: `App.tsx:815` (`toolsCapable` prop → AgentControls disables the switch with "Tools need an HTTP model that supports tool calling.", ui-pass `AgentControls.tsx:48,73`) and `useChat.ts:584` (throws).
- `ModelInfo.toolCalls` unused; `listModels()` (`openai-compat/index.ts:238-276`) maps only id/family/vision(always true)/reasoning (id heuristic).
- Consequences: any HTTP model (including ones without tool support, or tiny local models) can enable Tools; failure surfaces only as a server 400/ignored tools/malformed calls at send time. WebLLM provider hard-throws if history contains `role:'tool'` or `toolCalls` (`webllm/index.ts:112`) — safe today because history carries tool data only as folded text. Whether WebLLM 0.2.83 upstream supports function calling for some models is an **open question** (not checked).
- Final tools-free pass sends `tools: undefined`; provider omits `tool_choice` when no tools (`openai-compat/index.ts:510-514`) but the history still contains tool messages — some servers may reject that **[unverified]**.

### 1.5 Per-thread state

- `ragConfig` built every render in App (`App.tsx:204-207`): `libraryId = thread.libraryId === undefined ? defaultLibraryId ?? null : thread.libraryId` (tri-state: undefined=inherit, null=off, string=bound). `createThread` never writes libraryId (`useThreads.ts:30-37`).
- `automaticRagEnabled` undefined ⇒ legacy behavior "RAG only when tools off" (`useChat.ts:302`); AgentControls freezes it on first change (ui-pass `AgentControls.tsx:23-25`).
- `agentEnabled` toggled by the "Use tools" Switch (ui-pass `AgentControls.tsx:73`). Any MCP selection change sets `agentEnabled:false` (re-confirm, `:52-57`); stale saved ids are pruned and also force `agentEnabled:false` (`:35-37`).
- Tool count shown as `selectedCount + 3` (hardcoded built-ins, `:47`); built-in tool names hardcoded in UI list (`:97`); browser tests assert "(3 available)".
- `providerId`/`modelId` are mutable on a thread at any time (`App.tsx:366`, `:643`).
- [opinion] `ragConfig` is a new object every render and is a `useCallback` dependency of `runGeneration` (`useChat.ts:682`), so it re-creates every render — harmless but wasteful.

### 1.6 Compaction

`lib/compact.ts` (Codex checkpoint prompt, 60 s timeout, summary cap) + `useChat` auto (0.75 trigger, keep 1 exchange, min eligible 1000 tokens, max 5 generations, warn at 3; modes auto/drop/off, auto needs window ≥ 8192). Two kinds (`history`, `tail`), one active per kind; replaced message ids excluded from prompt; oversized inputs split and aggregated (#30). Manual "Compact now" path `useChat.ts:~830-870`. Activity JSON is included in compaction input.

### 1.7 Backup / export / import / reset / storage-stats coverage

| Store | reset.ts STORES (`:3-17`) | storage-stats (`:14-27`) / clearStore type | StorageManager labels (`:36-46`) | export (`lib/export.ts:31`) | import clear+write (`:61-75`) | validateImport fields (`:118-124`) |
|---|---|---|---|---|---|---|
| threads, messages, settings, promptTemplates, folders | yes | yes | yes | yes | yes | yes |
| libraries, documents, chunks, parents | yes | yes | parents unlabeled | yes | yes | yes (+ orphan checks `:174-179`) |
| summaries | yes | yes | unlabeled | yes | yes | yes (orphan check) |
| embeddings | yes | yes | yes | **no (by design)** | cleared | — |
| keys | yes | yes (protected) | yes | **no** | **cleared** (credentials never imported; `'keys' in root` rejected `:111`) | — |
| mcpConnections | yes | **missing** | missing | yes | yes | yes (strict keys + URL rule) |

Import validates thread `automaticRagEnabled`, `agentEnabled`, `libraryId`, `enabledToolIds` types (`:144-149`); message citations/activity/runStatus (`:150-158`); document `extractedText`/`pages` (`:140-143`). Unknown thread fields pass through unvalidated. Export version is still `1`.
Thread delete cascade (`useThreads.ts:48-60`): messages → summaries → thread, **three separate transactions** (not atomic). StorageManager allows per-store "clear" of any non-key store (e.g. documents without chunks) — integrity hazard [pre-existing].

---

## 2. Quality and tests

### 2.1 Unit tests (Vitest, node env, fake-indexeddb; `vitest.config.ts`)
- **Measured on dev: 20 files, 103 tests, all pass** (`pnpm test`, 0.7 s). `pnpm typecheck`: 0 errors/warnings (148 files).
- ui-pass adds `src/lib/format.test.ts` with 2 tests ⇒ 105 (matches v1-progress claim; **not run** on ui-pass by me).
- Per file (vitest JSON reporter): compact 14, agent 12, conversation-budget 10, tokens 9, export 9, token-calibration 7, rag-context 5, summaries 5, document-reader 4, openai-compat 4, pdf 4 (mocked parser), approvals 3, sanitize 3, network 3, embed-pipeline 3, citations 3, tools 2, validate-embedding 1, message-context 1, migration 1 (v8→v9 only).
- **No dedicated test file** (some may be exercised indirectly by embed-pipeline/rag-context tests or the eval harness): `services/mcp.ts`, `services/retrieval.ts` (only via eval), `lib/chunking.ts`, `lib/ingest.ts`, `lib/hybrid-search.ts`, `lib/vector-search.ts`, `lib/contextualizer.ts`, `data/threads|documents (delete cascade)|libraries|mcp`, `reset.ts`, `storage-stats.ts`, all hooks (useChat orchestration incl. RAG/agent wiring), WebLLM provider/worker, all components. Openai-compat has 4 tests (streaming/tool-call parsing).

### 2.2 Browser tests (`test/browser/chat.spec.ts`, Playwright 1.63, production `pnpm preview` on :4322, Chrome channel, headless)
17 `test()` declarations + 1 loop generating 4 (`Tools × RAG`, ui-pass `:454`) = **21 scenarios**: inline citations/activity/code colors; Tools dialog keyboard/settings; tools without library; whole-file cursor reads; library picker + RAG styles; streaming scroll; Stop persistence; stop-to-switch isolation; HTTP without WebGPU + prod CSP sanitizer (ui-pass relaxes only Chrome 157 "Executing inline event handler" report, `:290`); agent trail reload; regeneration + repeated manual compaction; oversized compaction aggregate; MCP discovery + approval under prod CSP; 4× Tools/RAG persistence; RAG citations survive reload/deletion; retrieval failure blocks request; text PDF page provenance; image-only PDF rejection. Judged from test titles only: HTTP appears mocked (fixture endpoints); no WebLLM coverage; no Knowledge ingestion beyond PDF; no import/export UI scenario.

### 2.3 Eval harness (`eval/`)
`pnpm eval` → `baseline.test.ts`: fixed 30 synthetic tasks (15 doc, 5 absent, 5 research, 5 tool/approval/error) with deterministic lexical embeddings; results committed in `eval/results/baseline.json`. `live.test.ts` opt-in via `HTLLM_LIVE=1` etc.; 90 runs done 2026-10-03 on LM Studio proxy `qwen3.6-35b-a3b` (`docs/v1-live-evaluation.md`): evidence 45/45, absent 15/15, research RAG 9/15 (60%), Agent 12/15 (80%). Single model, temperature 0; three-run multi-model gate still open. `summarize.mjs` mechanical summary.

### 2.4 Dead code / legacy / hygiene
- Legacy fields: `Thread.toolModelKey` (`types.ts:142`, unused), `Thread.ragEnabled` (`:178`, deprecated, unused), `DEFAULT_RAG_ENABLED` (`data/settings.ts:72-76`, deprecated, unreferenced), `ModelInfo.toolCalls` (`types.ts:65`, never set/read). No TODO/FIXME/HACK markers in `src/`.
- Exports **unreferenced outside their own file** (some are used in-file or are types; not all dead): functions worth checking — `lib/pdf.ts extractPdfText`, `data/documents.ts addDocument/updateDocument`, `data/chunks.ts addChunks/getChunk/deleteChunksForDocument`, `data/parents.ts addParents/getParent/getParentsForDocument/deleteParentsForDocument`, `data/embeddings.ts saveEmbeddings/deleteEmbeddingsForDocument`, `data/threads.ts getThread`, `data/settings.ts getAllSettings`, `hooks/useKnowledge useEmbeddingCount`, `hooks/useLibraries findSharedLibrary`, `lib/model-meta familyOf`, `webllm/model-list groupByFamily`, `registry getAllProviders`. Several `data/` writers are bypassed because `lib/ingest.ts` and `lib/embed-pipeline.ts` write via raw `getDb()`.
- Layering violations: `lib/export.ts:1-2` imports `data/db` **and `services/approvals`** (lib → services upward dep); `lib/ingest.ts:13,143`, `lib/embed-pipeline.ts:13,156` call `getDb()` directly; `lib/hybrid-search.ts`, `rag-context.ts`, `token-calibration.ts` import `data/*`. Components do not call `idb` (only `services/tools.test.ts` does). Components do branch on provider id in `ModelPicker.tsx` (`WEBLLM_ID` at dev `:139,:144`; ui-pass adds `:97`) and `ui/ProviderLogo.tsx:37`.
- UI wording: user-facing "Agent mode" renamed to "Tools" on ui-pass; remaining internal strings "Invalid Agent setting" (`export.ts:146`), "Agent context budget reached" (`agent.ts:45`); docs still say Agent (`v1-guide.md:39` "Tools (agent mode)", roadmap, compatibility, eval README).
- Size hotspots (lines): App.tsx 934, useChat 896, SettingsModal 736, openai-compat 628, StorageManager 497, useKnowledge 494, KnowledgePage 427, types.ts 397, Composer 397, EmbeddingModelSelector 363, ChatPage 346. Total src TS/TSX ≈ 18 k lines.

### 2.5 docs/architecture-review.md flags
- **Flag 1 (App.tsx god component): still holds.** 934 lines, 19 `useState`, 34 effects/callbacks; owns thread/library/default-library/params/agent wiring; review predicted "~1000 lines" — essentially reached. No `useActiveLibrary/useAppSettings` extraction happened.
- **Flag 2 (hooks as orchestrators): partially addressed.** `src/services/` now exists (agent, tools, retrieval, mcp, approvals, document-reader) and is unit-tested, but `useChat` still orchestrates history cleaning, RAG, budget fitting, auto/manual compaction, agent setup and persistence (896 lines, grew). `useKnowledge` untouched (494).
- **Flag 3 (lib mixing infra + domain): holds and worsened.** 28 non-test files (review threshold ~20-25); lib now also has IDB access and an upward import into services, breaking the review's "lib purity is the most important invariant".
- Review's stated invariants: #1 holds for components; #2 broken in ModelPicker/ProviderLogo (minor); #3 holds (main thread uses `import type` + dynamic `import()` — CLAUDE.md's literal "never imports" is inaccurate, AD-18 is the real rule); #4 broken; #5, #6 hold.

---

## 3. Doc drift

### 3.1 Code changes since SDD baseline
SDD index says baseline `5282806` (2026-05-23), but its content was last edited in `56377bb` (one commit later, same day) — effective baseline 56377bb. `git diff 5282806..feat/ui-pass`: **154 files, +15 144 / −857, 64 commits.** Grouped:

| Area | Files | +/− | Notes |
|---|---|---|---|
| src/lib | 36 | +2809/−33 | chunking, pdf, ingest, embed, hybrid/vector search, rag-context, compact, tokens, budget, calibration, citations, sanitize, message-context, export |
| src/components/knowledge (new) | 13 | +2500 | whole Knowledge page |
| src/components/chat | 17 | +1180/−238 | AgentControls, ToolApproval, MessageEvidence, SourceDialog, Summary/Trim dividers, KnowledgeChip |
| src/hooks | 4 | +1231 | useKnowledge, useLibraries, useChat growth |
| src/data | 14 | +909 | 8 new stores' repos, v4–v9 migrations |
| src/services (new) | 10 | +507 | whole layer |
| src/providers | 6 | +652 | embeddings, tool calls, agent-types |
| settings/storage/system/ui/providers comps | 12 | ~+800 | MCP settings, Storage, Switch |
| test, test/browser, eval, eval/results, scripts | 10 | +1382 | new |
| docs (non-SDD) | 8 | +1415 | roadmap, v1-*, architecture-review, phase-3-part-2-plan, archive |

ui-pass vs dev (16 files, +310/−107): `docs/v1-guide.md, docs/v1-progress.md, App.tsx, chat/AgentControls.tsx, chat/EmptyState.tsx, chat/MessageEvidence.tsx, chat/ToolApproval.tsx, knowledge/DocumentDetail.tsx, providers/ModelPicker.tsx, settings/McpSettings.tsx, system/WebGPUBlock.tsx, ui/Switch.tsx (new), lib/citations.ts, lib/format.ts, lib/format.test.ts, test/browser/chat.spec.ts`.

### 3.2 Stale SDD sections (all of `docs/sdd/` describes Phase 2)
- **01 Introduction** §1.2 lists Phase 3 RAG / Phase 4 agent as future (`01-introduction.md:43-44`).
- **02-03** §2.2 external systems: no MCP servers, embedding endpoints; §3.2 concerns lack tool safety/approval, untrusted document content.
- **04 Architecture** §4.1 no services layer, no Knowledge/MCP; §4.3 flows lack RAG/agent.
- **05 Views**: composition/logical/dependency/information/interface/process views all pre-RAG.
- **06 Design elements** §6.1 catalog lacks every v1 element (libraries, documents, chunks, parents, embeddings, summaries, MCP, services, approvals, citations, compaction); §6.5 config.
- **07-08** traceability/rationale lacks v1 decisions (D8–D12, tool limits).
- **09-10** risks: no prompt-injection/tool/MCP risks; "Unresolved decisions" outdated.
- **11 Data design**: "Schema version: 3" (`11-data-design.md:61`), ERD/dictionary only 6 stores; `:171` says Phase 3 "will add an embeddings store".
- **12 Component design**: no services/knowledge/agent components.
- **13 HID**: no Knowledge page, Tools dialog, approval dialog, evidence disclosures, Storage changes.
- **14 RTM**: no v1 requirements.
- **15 Appendices**: sequences (no tool loop), §15.6 testing strategy says "Vitest (if added)" and manual E2E (now Vitest + Playwright + eval).
- **16 Decisions**: AD-1..AD-19 only; AD-5 "Phase 1–4" state; deferred table lacks OAuth/stdio/memory decisions.
- `.agent-doc-skills/sdd/gaps/2026-05-23.md` also from May.
- v1-progress gate "Reconcile existing SDD" is open; roadmap explicitly says do not trust SDD phase claims.

### 3.3 CLAUDE.md stale statements
- "Models run in the browser via WebLLM" — also three HTTP providers.
- "Don't add embeddings, RAG, or agent code in Phase 1" — obsolete (all shipped).
- "Don't add OpenAI or Anthropic providers — they need a CORS relay" — **partly stale**: a generic OpenAI-compatible provider exists; registry corsNote (`registry.ts:21-22`) still states api.openai.com lacks CORS, so the native-provider rule still has a basis.
- "WebLLM in Web Worker only. Main thread never imports `@mlc-ai/web-llm`" — literally false: `providers/webllm/index.ts:1-5` (type-only), `:83, :193` and `webllm/model-list.ts:43` dynamic imports on main thread. Real rule = no static runtime import (AD-18).
- "IndexedDB through `src/data/` only" — violated by `lib/ingest.ts`, `lib/embed-pipeline.ts`, `lib/export.ts` (not components, so the narrower "no raw idb in components" still holds).
- "Five layers" and architecture list — missing `src/services/`; component dirs (knowledge, command, landing, nav, storage); hooks (useKnowledge, useLibraries, useFolders); data list (folders, libraries, documents, chunks, parents, embeddings, summaries, mcp, reset, storage-stats); lib list (≈28 files).
- Commands omit `pnpm test`, `pnpm test:browser`, `pnpm eval`.
- "Don't introduce Redux/Zustand…" still valid. Design system still valid.

### 3.4 docs/architecture-review.md
Header says "as of branch phase-3-rag… schema v6"; sequencing ("Part 2 first, then Flag 1, then Flag 2") — Part 2 partially shipped, Flag 2 started via services without Flag 1 (contrary to its anti-sequencing advice). Flag status in §2.5.

### 3.5 docs/phase-3-part-2-plan.md (Status still "planning")
- **Implemented**: D8 parent-child chunking (ee29988) + opt-in Contextual Retrieval (`lib/contextualizer.ts`, `Library.useContextualRetrieval`); D10 compaction (0.75 trigger, replace-not-stack, cap 5 — but recency is "keep 1 exchange", not 25% window; tail summaries and oversized splitting added); PDF ingestion (D9) in simplified form.
- **Superseded/diverged**: pdfjs "5.x + geometry extraction (columns, header/footer strip)" → pdfjs-dist 6.3.289 plain text concatenation (`pdf.ts:30`); "Utility model" slot not built (compaction/contextualizer use chat model); D12 GraphRAG skip consistent.
- **Pending/deferred**: D11 persistent memory (no `memories` store; roadmap moved it to Deferred); query rewriting (roadmap Deferred: "separate query rewriting"); BYOK fallback for secondary tasks.

### 3.6 roadmap / v1-progress open gates (ui-pass v1-progress)
Open: broader PDF failure/cancellation + modern MCP negotiation fixtures; SDD reconciliation; live Ollama/LM Studio/cloud/MCP qualification; Chrome/Edge + Firefox/Safari HTTP-only qualification; three-run model quality gates and release packaging. "v1 is not release-qualified." Roadmap deferred list: OAuth, stdio bridges, OCR, Office files, persistent memory, branching, MCP Apps, arbitrary scripts, reranking, query rewriting, local embedding inference.

---

## 4. Workspace impact analysis

Planned: per-chat `mode` ('chat' | 'workspace') locked at creation; Workspace = virtual dir (attached files + read-only libraries as files + model-written notes/drafts/tables), list/read/search/write, user download, no shell.

### 4.1 Thread `mode` field and the lock — **main structural issue**
- There is no real "creation moment": App auto-creates a thread on load/after last delete with `webllm` + loaded model (`App.tsx:321-332`); "New chat" reuses the current thread if it has 0 messages (`App.tsx:404-407`); the new-chat screen is just `EmptyState` rendered when `messages.length === 0` (ui-pass `ChatPage.tsx:~187`).
  ⇒ Practical lock rule: mode editable while the thread has 0 messages (shown on EmptyState), frozen after first send. [opinion: simplest; "locked at creation" literally would require a draft-thread concept.]
- Add `mode?: 'chat' | 'workspace'` to Thread (undefined ⇒ 'chat' for all existing threads, no backfill needed). Add to `validateImport` thread checks (`export.ts:144-149`) — unknown fields currently pass unvalidated.
- `providerId/modelId` are mutable mid-thread (`App.tsx:366, 643`). A Workspace thread can be switched to WebLLM, or to an HTTP model without tool support. Need: block WebLLM in the picker for workspace threads, or keep the thread and show "Workspace needs an HTTP tool-capable model" (like `useChat.ts:584` today).
- `handleCreateThread` carries current provider/model into new thread; WebLLM default on auto-created thread means a Workspace choice needs a model switch first.

### 4.2 New workspace file store (DB v10)
Touchpoints for a new store (e.g. `workspaceFiles`, key id, indexes `byThread`, maybe `[threadId, path]` unique):
1. `data/db.ts` `HtllmDB` type + `if (oldVersion < 10)` block; `DB_VERSION = 10`.
2. New `data/workspace-files.ts` repo (keep it in data/, not lib/).
3. `data/reset.ts` STORES list.
4. `data/storage-stats.ts` list + `clearStore` union (also add the already-missing `mcpConnections`), `StorageManager.tsx` STORE_LABELS.
5. `lib/export.ts`: export tx list (`:31`), `ExportData`, import store list (`:61-75`), `validateImport` fields + type checks + orphan check (file.threadId ∈ threads), size sanity.
6. Thread delete cascade in `useThreads.remove` (`:48-60`) — today three non-atomic deletes; add files (ideally one tx in data layer).
7. `data/migration.test.ts` (only covers v8→v9) + export tests.
- Storage: model-written files are text; IndexedDB fine. Attached files: decide whether to store raw text only (`extractedText` + `pages`) or also the original Blob (needed for faithful download of PDFs). [opinion: text + pages only for slice 1.]

### 4.3 Mapping existing document tools to file tools
| Existing | Workspace equivalent | Notes |
|---|---|---|
| `list_documents` (one library) | `list_files` over thread files + attached libraries' docs, path-like names (`/attached/x.pdf`, `/library/<lib>/y.md`, `/notes/…`) | `documentTools(libraryId)` and `doc.libraryId !== libraryId` check (`tools.ts:23-38`) assume one library; generalize to a set of allowed scopes. |
| `read_document(documentId, cursor)` | `read_file(path, startLine?, endLine?)` or keep cursor | `readDocumentPage` is char-offset-based and reusable for any `{extractedText,pages}` object. |
| `search_knowledge` | `search_files(query)`: lexical (grep-like) over workspace files + semantic over attached indexed libraries | `retrieve()` throws unless library fully embedded (`retrieval.ts:22`); thread-attached files are not embedded ⇒ need a non-embedding search (simple substring/regex or MiniSearch, which is already a dependency). |
| — | `write_file(path, content)`, maybe `append_file`, `delete_file` (model-written only) | Built-in tools skip approval (only `server` tools prompt, `agent.ts:85`); local writes OK without approval, but overwrite/delete of user-attached files should be disallowed. |
- Attached files today must be ingested into a library (Document.libraryId required; ingest writes chunks/parents; orphan check on import). Options: (a) per-thread hidden library (reuses ingest, but pollutes library UI and needs embedding to be searchable); (b) new store with `{threadId, path, text, pages, source:'attached'|'model'}` reusing `extractPdf`/text readers but **not** `ingestFile`. [opinion: (b) is cleaner and avoids embedding requirement.]
- Composer accepts only images (`Composer.tsx:310`); needs a file-attach path for workspace mode.

### 4.4 Line-range reads and line → page mapping
- `Document.pages` = char offsets into `extractedText` (`pdf.ts:31-33`); no line index stored. Line ranges can be computed on the fly: split `extractedText` on `\n`, cumulative offsets, then intersect `[lineStartOffset, lineEndOffset)` with `pages` exactly like `readDocumentPage` does (`document-reader.ts:17`). Cheap for MB-scale text; could cache per call.
- Caveat: PDF text is built from `item.str + (hasEOL ? '\n' : ' ')` per page plus `\n\n` between pages (`pdf.ts:30-32`), so "lines" in PDFs are extraction artifacts, not visual lines; very long lines are possible (single-line pages) — a line-range read must still respect a char cap.
- Legacy documents (no `extractedText`) fall back to joined chunks with `originalAvailable:false`; line numbers there are unstable.
- Citation ids today: `${docId}:read:${start}-${end}` (char range). For line reads use e.g. `${fileId}:L${a}-${b}`; `SourceCitation` has no line fields — add optional `lineStart/lineEnd` (import validator tolerates extra fields on citations; only checks required strings).

### 4.5 Citations for model-written files
- `SourceCitation` requires `documentId, chunkId, filename, excerpt` (import validator `export.ts:151`). `MessageEvidence` calls `getDocument(documentId)` and shows "Original document unavailable" when absent (ui-pass `MessageEvidence.tsx:22-31`) — model-written files would always show that unless evidence lookup becomes store-aware.
- [opinion] Model-written notes should not count as evidence (circular): either exclude them from citations, or add `SourceCitation.kind: 'document'|'workspace'` and render workspace sources distinctly ("your notes", not grounding). Citation rendering (`citations.ts`) resolves only against saved per-message citations, so a `[[Source …]]` to a non-supplied note shows as unresolved — that safety property is preserved automatically.

### 4.6 Agent limits vs workspace use
- 8 calls per user turn (`agent.ts:22`) — includes list/search/read/write. Read pages are capped at **4000 chars** each (`document-reader.ts:29`), so one turn reads ≤ ~32 k chars before any write; a 100 k-char PDF needs ≥ 25 reads ⇒ ≥ 4 turns. Workspace likely needs a higher per-turn limit (e.g. 16–24) or larger pages tied to context window, plus a "continue" affordance.
- 60 s tool timeout fine for local tools.
- Result cap min(8000, remaining budget) and mid-run hard error "Agent context budget reached" (`agent.ts:45`): tool results accumulate within a turn with no in-turn compaction ⇒ on 8 k–16 k context local models, a workspace turn will hit the budget after a few reads.
- **Replay cost**: every saved `activity[].result` (up to 8000 chars × 8) is re-sent on every later turn via `withActivityContext` (`useChat.ts:295`) and fed into compaction. Workspace turns will inflate history quickly. [opinion] For workspace, store full results only in activity for UI and replay a compact stub ("read /x lines 1-120") — or rely on files as the persistent memory instead of history.
- Write content arrives as tool-call arguments, capped at 64 000 chars per call (`agent.ts:53`); large drafts also consume output tokens and are replayed in history as `arguments`.

### 4.7 "Use tools" switch and `enabledToolIds`
- In Workspace mode, tools are the point; the master switch (`agentEnabled`) would be implicitly on and locked. But the current UI forces `agentEnabled:false` whenever MCP selection changes or stale ids are pruned (ui-pass `AgentControls.tsx:35-37, 52-57`) — conflicts with an always-on Workspace. Need mode-aware behavior (keep built-ins on, only re-confirm MCP).
- `enabledToolIds` must remain MCP-only: `externalTools` throws if any id doesn't resolve (`mcp.ts:91`). Built-in workspace tools should be implied by mode, not stored in `enabledToolIds`.
- Hardcoded "+3" count and tool name list (`AgentControls.tsx:47, 97`) and browser tests asserting "(3 available)" will change.
- Chat mode: keep current Tools switch (document tools + MCP) or remove tools from Chat mode entirely? Product decision; current behavior lets Chat threads use tools.

### 4.8 Automatic RAG interplay
- Today automatic RAG runs before generation when a library is bound and `automaticRagEnabled ?? !agent` (`useChat.ts:302`), and **throws on retrieval failure**, blocking the turn. In Workspace with attached read-only libraries, automatic RAG should probably default off (model searches on demand) or be best-effort; otherwise an unindexed attached library blocks every workspace turn.
- Workspace "attached libraries" generalize `libraryId` (single) to a list; tri-state `libraryId` + `defaultLibraryId` inheritance would need a decision for workspace threads (e.g. inherit default as first attachment, or none).

### 4.9 MCP placement
- MCP tools are global connections + per-thread `enabledToolIds`, approvals per call. They fit either mode unchanged. [opinion] Keep MCP available in both modes, but keep it out of the workspace file abstraction (no MCP→file writes in slice 1). Note one pending approval at a time and reconnect-per-turn cost.

### 4.10 Per-provider vs per-model capability; WebLLM
- Gate is per provider; every HTTP model is "tool-capable". Workspace availability would follow the same coarse gate unless `ModelInfo.toolCalls` is populated. Possible sources [unverified, outside code]: OpenRouter `/models` `supported_parameters`, LM Studio `/api/v0/models` capabilities, Ollama `/api/show` capabilities; generic endpoints expose nothing ⇒ needs a user override. Minimal option: keep per-provider gate, show "needs a model that supports tool calling" and surface 400s clearly.
- WebLLM: `toolCalls:false`, provider throws on tool messages. Workspace mode would be unavailable for WebLLM threads in slice 1. Whether web-llm 0.2.83 supports function calling for specific models is an open question.

### 4.11 Risks
1. Lock semantics vs auto-created/reused empty threads and mutable model (4.1).
2. Context budget exhaustion on small-context local models (4.6) — the main local-first audience.
3. History replay of tool results (4.6) multiplies cost; interacts with compaction (activity JSON in summaries).
4. Data integrity: non-atomic thread delete cascade; StorageManager per-store clears; import validation must cover the new store.
5. Evidence semantics for model-written files (4.5) — risk of "citing your own notes".
6. Per-provider tool gate: users pick non-tool models and get opaque failures.
7. Prompt injection from attached files now able to trigger writes (local only; no external effect unless MCP enabled — MCP approval still applies).
8. App.tsx/useChat size: adding mode wiring there grows the god component [opinion: put workspace tool assembly in `services/`, mode resolution in a small hook].
9. Docs/SDD drift grows further unless reconciled.
10. Regenerate / edit-and-resend delete later messages (`deleteMessagesAfter`), but workspace file writes made by those turns would survive, so file state can diverge from the visible transcript. Needs a stated rule (accept divergence, record writes per message and roll back, or version files).

### 4.12 Smallest viable slice [opinion]
1. `Thread.mode` (undefined ⇒ chat), chooser on EmptyState, editable until first message; validate in import.
2. Workspace requires HTTP provider (existing per-provider gate); block/flag WebLLM for workspace threads.
3. New `workspaceFiles` store (v10) holding text files only: model-written notes (`source:'model'`) + attached text/MD/PDF extracted text with `pages` (`source:'attached'`); cascade on thread delete; reset/stats/export/import coverage.
4. Built-in tools in workspace mode (implied, not in `enabledToolIds`): `list_files`, `read_file` (line range, reuse `readDocumentPage` logic + line→page map), `search_files` (lexical only), `write_file` (model files only, no overwrite of attached). Bound library docs exposed read-only via list/read by reusing current doc tools.
5. Download button per model-written file (Blob + `<a download>` like `downloadJson`).
6. Raise per-turn call limit for workspace only; keep 60 s and 8000-char caps.
7. Defer: semantic search over workspace files, multiple attached libraries, original-binary storage, per-model capability detection, MCP↔file integration, line-indexed storage.
