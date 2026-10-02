# htllm — Historical Feature Roadmap

Archived on 2026-10-03. Superseded by [the v1 roadmap](../roadmap.md).
This file preserves prior decisions; it is not the current delivery scope.

This roadmap slots every planned feature into a phase and records the
architecture decisions that gate UI design. It is a planning document — the
SDD under `docs/sdd/` remains the formal spec of record and will be revised to
absorb this once the v2 UI prototype is locked.

Status legend: ✅ built · ◐ partial / has gaps · ☐ planned · ✦ new (from
feature discussion, not yet in the SDD).

---

## Gating decisions (locked)

These three decisions are settled now because they reshape layout or data
design and are expensive to retrofit.

### D1 — Multi-page navigation shell from Phase 1

The app is no longer single-surface. It gets a persistent navigation rail with
three destinations: **Chat**, **Knowledge** (RAG / global search), and
**Storage** (data + cache manager). Only Chat is live in Phase 1; Knowledge and
Storage render as disabled/"coming soon" entries until their phase. Designing
the shell now means later phases slot in without relayout.

### D2 — Embedding vectors are model-tagged

An embedding vector is only comparable to others produced by the *same*
embedding model. The `embeddings` store must record `embeddingModelId` and
`dim` on every vector. Switching embedding models invalidates the index — all
content must be re-embedded. RAG also requires a chat model *and* an embedding
model resident at once, which the fit budget / system rail must account for.

### D3 — Markdown + code highlighting pulled forward to Phase 2

Originally Phase 5. Plain-text rendering of assistant replies is the single
most visible quality gap, so markdown + syntax highlighting moves to Phase 2.
Library choice favors a lightweight renderer over heavy ones (bundle cost);
final pick deferred to implementation.

### D4 — Vision capability is per-model, not per-provider

WebLLM (one provider) runs both vision and non-vision models, so a
provider-level `capabilities.vision` flag is the wrong granularity. `ModelInfo`
gains a per-model `vision: boolean`, sourced from WebLLM's `model_type`
(`ModelType.VLM`) with a model-id heuristic fallback. The model picker badges
vision models; the composer's image attach is gated on the loaded model being
vision-capable. Supersedes the SDD's provider-level `capabilities.vision`.

### D5 — Cloud API providers collapse into one OpenAI-compatible provider

Groq, OpenRouter and other hosted APIs all speak the OpenAI
`/v1/chat/completions` format, so they ship as a single BYOK provider —
"OpenAI-compatible API" with a user-supplied base URL + key — rather than one
provider each. Ollama and LM Studio stay as distinct localhost providers
(they keep auto-detection). Supersedes the SDD's separate Groq / OpenRouter /
generic-endpoint entries.

### D6 — Embedding models are provider-served, not WebLLM-exclusive

An embedding model is a model like any other. WebLLM runs local ones, and the
OpenAI-compatible (D5) and Ollama providers expose `/v1/embeddings` (or the
equivalent) — so embedding support is not WebLLM-only. This gates the provider
abstraction: a provider must expose an embedding capability separate from
`ChatProvider.chat()` — either a distinct `EmbeddingProvider` interface or an
`embed()` method behind a `capabilities.embedding` flag. The model picker's
embedding type must therefore source models across providers, not just WebLLM.
D2 still holds — vectors stay tagged to the producing model id regardless of
which provider produced them. Privacy note: API / localhost embedding sends
document chunks off-device (the same opt-in trade as BYOK chat), so the UI must
label non-local embedding explicitly.

### D7 — Optional CORS proxy as a companion binary, not a server dependency

htllm remains fully static — `astro build` produces `dist/`, no SSR, no API
routes. CORS-blocked providers (OpenAI, Anthropic, Google) are unreachable from
browser `fetch()` because those APIs don't send `Access-Control-Allow-Origin`.
Rather than adding a server dependency, an **optional companion binary**
(`htllm-proxy`, written in Go) runs on localhost as a pass-through reverse
proxy that adds CORS headers. It:

- Binds localhost-only (no remote access)
- Forwards requests verbatim — no SDK, no request rewriting
- Adds CORS headers + handles `OPTIONS` preflight
- Streams SSE responses with immediate flushing (no buffering)
- Exposes `/health` for auto-detection by htllm
- Supports multi-target routing (one instance → multiple upstreams)

htllm detects the proxy the same way it detects Ollama (health-check on known
port). When absent, CORS-blocked providers simply don't appear. When present,
the user configures base URL = `localhost:PORT` in the existing BYOK provider
settings — **no UI changes to the provider abstraction**.

Privacy: API keys flow `browser → localhost proxy → API`. Keys never leave the
machine (same trust model as Ollama/LM Studio).

### D8 — Parent-child hierarchical chunking + opt-in Contextual Retrieval

Phase 3 Part 1 shipped flat markdown-aware chunking. Part 2 refactors to
**parent-child recursive**: 400-token child chunks (15% overlap, token-aware)
for retrieval, 1,500-2,000 token parent chunks for LLM context. Retrieval
returns parents after vector hits on children — best of both precision and
context. Vecta's Feb 2026 benchmark + LangChain ParentDocumentRetriever
pattern. Adds `parents` IDB store with `parentId` FK on chunks; no migration
risk to existing libraries.

Adds **Contextual Retrieval** (Anthropic, late 2024) as a per-library opt-in:
a small local LLM prepends a 50-100 token blurb situating each chunk in its
parent doc before embedding. Anthropic's evals show 35-49% retrieval failure
reduction. Cost is wall-clock during library build, not API dollars — free
on-device via the loaded WebLLM model.

Explicitly skipped: semantic (embedding-boundary) chunking — 14× slower with
no quality lift. Late chunking — requires long-context embedder we don't
ship yet.

Full plan: `docs/phase-3-part-2-plan.md` §1.

### D9 — PDF via pdfjs-dist; OCR and table extraction explicitly punted

PDF ingestion uses **pdfjs-dist 5.x** (~350 KB gzip core + 700 KB gzip
worker, lazy-loaded inside a dedicated ingest worker). Extraction is
geometry-based: `getTextContent()` items + 1-D k-means column detection +
header/footer band stripping. Skips font-size heading detection and table
reconstruction in v1 — the 80/20 win is columns + headers/footers.

**OCR**: detect-and-banner pattern, never auto. Tesseract.js v6 is viable
but ~10-30 sec/page makes 100+ page scans unusable. Banner offers opt-in
when extraction yields no text.

**Tables**: no production browser table extractor exists. Cells are emitted
as positioned text and the LLM reasons over them. Add TODO and move on.

**Chunking**: don't chunk by page (cuts mid-sentence). Concatenate clean
per-page text, then run the §D8 chunker. Attach `{page_start, page_end}`
metadata per chunk for citations.

Pipeline: two workers (pdfjs's own + our ingest worker), batches of 4-8
pages, `page.cleanup()` after each, `pdfDoc.destroy()` at end. Throughput
~50-100 pages/sec text-native on M-series. Stream `{phase, page, total}`
progress events to the UI.

Full plan: `docs/phase-3-part-2-plan.md` §2.

### D10 — Context compression: 75% trigger, 25% recency, replace-not-stack

Auto-compact at **75% of model context window** (token-counted, not
message-counted). Conservative vs Claude Code's ~83% because small local
models degrade earlier. Plus an always-available manual "Compact now" button
(community consensus: manual compaction beats auto for quality).

**Recency window**: last 25% of context window verbatim (token budget, not
turn count). Floor: last 2 user/assistant pairs. Latest user turn always
preserved intact.

**Summary prompt**: 5-element structure synthesized from Claude Code /
Codex / Anthropic API defaults — original goal, decisions + rationale,
facts verbatim, code (verbatim if short / signatures if long), current
state. Tool-call JSON kept verbatim as cheap Phase 4 insurance.

**Re-compaction**: replace prior summary, never stack (quality decays
multiplicatively). Feed old summary as ground truth into new prompt. Hard
cap at 5 compactions per thread; warn at 3.

**UI**: persistent token meter in chat header (green/amber/red at
50/75/90%); inline divider `── summarized 14 turns (3.1k → 480 tokens) ──`
with click-to-expand; original messages stay in IndexedDB, only excluded
from prompt; setting on / manual-only / off (default on).

**Model**: default to loaded WebLLM model; optional "summarize with BYOK
provider" for higher quality (one frontier call per compaction is cheap).
Summaries persisted to IDB alongside thread.

Full plan: `docs/phase-3-part-2-plan.md` §3.

### D11 — Persistent memory: Mem0-lite flat IDB store, user-turn extraction

Architecture is **single-tier flat facts list**, not Letta-style core/
recall/archival hierarchy. For personal chat at ~1000 facts/year, flat list
+ vector index is sufficient. Reuses the embedding pipeline shipped for
libraries — no new infra.

**Extraction**: end-of-turn, debounced every 3 turns (per-turn doubles
inference cost; end-of-session is too lossy for a closeable web tab).
Mem0's prompt shape — JSON output, self-contained 15-80 word facts,
`attributed_to` field, ground dates to observation time. Runs on the loaded
WebLLM model.

**Update**: vector top-5 similar facts → single LLM call returns
`ADD/UPDATE/DELETE/NONE` with `old_memory` for audit log.

**Retrieval**: at chat start, top-8 by `0.7·cosine + 0.3·recency`, injected
as `<user_memory>` block in system prompt (cap ~500 tokens). Curated facts
only — never raw episodes.

**Security**: extract from **user turns only by default**. Assistant-turn
extraction is a known prompt-injection vector (RAG content can poison
memory). Gated behind an explicit opt-in setting.

**UI** (stolen from ChatGPT): inline "Memory saved" toast with undo;
Manage Memories screen (list/edit/delete/forget-from-chat); per-thread
"pause memory" toggle (htllm's Temporary Chat analog); global on/off +
review-before-save mode; collapsible "Memory used (3 facts)" chip on
assistant messages.

Deferred to v3+: procedural memory (self-editing persona), graph/entity
linking, episodic summaries grouped by time period, Letta-style hierarchy.

Full plan: `docs/phase-3-part-2-plan.md` §4.

### D12 — GraphRAG out of scope; agentic search covers multi-hop instead

**Decision: skip GraphRAG.** Recorded here so it doesn't get relitigated.

Cost model is fundamentally incompatible with browser-only constraint:
Microsoft GraphRAG requires ~17.6k tokens per doc at indexing time (4-6 LLM
calls per chunk via extraction + gleaning + summary refinement). 100 docs ≈
~16 hours of WebLLM compute on M-series. Small local models also do entity
extraction noticeably worse than the GPT-4o-mini baseline published
quality numbers come from.

What graph would win: global / sensemaking ("summarize my whole library"),
multi-hop ("which authors cite work that contradicts X"), aggregation /
counting, entity disambiguation across many docs. Vector still wins on
local fact lookup — the bulk of chat queries — and is 100× cheaper.

**Strategy**: Phase 4 agentic search covers most multi-hop wins on-demand
via iterative tool calls — each query pays its own cost, no upfront graph
construction. If users hit a wall on global queries later, add a
**HippoRAG-style lightweight layer**: 1 OpenIE-style triple call per chunk
(not 4-6), store edges in IDB, run Personalized PageRank in JS at query
time. No community summaries, no Leiden, incremental on top of the existing
vector store. **Never** ship full MS GraphRAG indexing in-browser — if ever
needed, it'd require Tauri/Electron, out of scope.

Full rationale: `docs/phase-3-part-2-plan.md` §5.

---

## Phase plan

### Phase 1 — Foundation ✅ shipped

Core local-inference chat. Complete.

| Feature | Status |
|---|---|
| Astro static scaffold, React islands, TypeScript | ✅ |
| `ChatProvider` abstraction + registry | ✅ |
| WebLLM provider in a Web Worker | ✅ |
| IndexedDB persistence (threads, messages, keys, settings, templates) | ✅ |
| Multi-thread sidebar (create / switch / delete) | ✅ |
| Model picker popup — search, family grouping, fit heuristics | ✅ |
| System detection rail | ✅ |
| Streaming chat + throughput display | ✅ |
| Vision / image attach | ✅ |
| Prompt templates with `/` trigger | ✅ |
| Data import / export | ✅ |
| WebGPU block screen | ✅ |
| Per-thread parameter UI | ✅ |
| Navigation shell (Chat live; Knowledge/Storage stubs) | ✅ |
| Chat rename | ✅ |
| System prompt edit — per-thread, with a configurable global default in Settings | ✅ |
| Regenerate response | ✅ |
| First-run landing — landing shown once; returning visitors redirect `/` → `/app` via a `localStorage` flag set on app entry | ✅ |

### Phase 2 — External providers + chat quality ✅ shipped

| Feature | Status |
|---|---|
| Ollama, LM Studio providers (localhost) | ✅ |
| OpenAI-compatible API provider — BYOK, base URL + key (covers Groq / OpenRouter / custom) | ✅ |
| Markdown rendering + code block syntax highlighting (D3) | ✅ |
| Context controls — context-window size + history window (messages attached per request) | ✅ |
| Auto-generated session names — model-written thread titles from the conversation | ✅ |
| Prompt-template management UI — create / edit / delete, plus collections, search and import / export | ✅ |
| Storage manager — basic (model cache list, IDB usage, clear data) | ✅ |
| Global conversation search — full-text over all threads/messages (wired into Cmd/Ctrl+K palette) | ✅ |
| Chat folders / thread organization | ✅ |
| Edit any user message + regenerate from that point | ✅ |
| Keyboard-first navigation — shortcuts + command palette | ✅ |

### Phase 3 Part 1 — Knowledge / RAG ✅ shipped

| Feature | Status |
|---|---|
| `embeddings` IndexedDB store, model-tagged (D2) | ✦ ✓ composite key `[chunkId, embeddingModelId]` for multi-model coexistence |
| Embedding model support in the picker (model-type aware) | ✦ ✓ EmbeddingModelModal mirrors chat picker (tabs + family groups + manual entry) |
| Embedding via OpenAI-compatible API / Ollama — provider-served `/v1/embeddings` (D6) | ✦ ✓ + dedicated `/v1/embeddings/models` discovery + known-model fallback for OpenRouter |
| txt / md ingestion + markdown-aware chunking | ✦ ✓ |
| PDF ingestion (lazy-loaded parser) | ◐ stubbed — defers to Phase 3 Part 2 |
| Vector store + hybrid retrieval (BM25 + cosine) | ✦ ✓ minisearch + brute-force cosine + library scope filter |
| Knowledge page — global semantic search + 3-column document workspace | ✦ ✓ Libraries · Documents · Preview, scope chips |
| File / document manager (Storage page) | ✦ ✓ Documents section + per-model embedding indexes |
| **Libraries** — named groups of docs pinned to one embedding model | ✦ ✓ (rename from "corpus") |
| Per-thread library binding for RAG (composer KnowledgeChip) | ✦ ✓ |

### Phase 3 Part 2 — Chat-side knowledge features + RAG quality

Independent items — ship in any order. Detailed designs and rationale in
`docs/phase-3-part-2-plan.md`.

| Feature | Status |
|---|---|
| **Chunking refactor** — parent-child hierarchical (400 child / 1500 parent, 15% overlap) replacing flat markdown-aware splitter (D8) | ✦ ☐ |
| **Contextual Retrieval** — per-library opt-in; local LLM prepends situating blurb to each chunk before embedding; 35-49% retrieval lift (D8) | ✦ ☐ |
| **PDF ingestion** — pdfjs-dist 5.x in worker, geometry-based extraction, OCR detect-and-banner only, tables as positioned text (D9) | ◐ stub → real impl |
| **Context compression** — 75% auto-trigger + manual, 25% recency budget, replace-not-stack, 5-cap, token meter UI, inline divider (D10) | ✦ ☐ |
| **Persistent memory** — Mem0-lite flat IDB facts list, end-of-turn debounced extraction, top-8 retrieval, `<user_memory>` injection, user-turn extraction default (D11) | ✦ ☐ |
| **Query rewriting** (RAG Layer 2) — small LLM call reformulates the user's message into a better embedding query before retrieval. Optional: global toggle in Settings → Knowledge, per-thread toggle in the KnowledgeChip modal. Default off. | ✦ ☐ |
| Conversation branching / tree view — pairs with edit-from-mid-conversation | ✦ ☐ |
| GraphRAG — **out of scope (D12)**. Agentic search (Phase 4) covers most multi-hop wins on-demand. HippoRAG-style lightweight layer documented as escape hatch if needed later. | ✗ skipped |

### Phase 4 — Agentic

Tool-use and agent loops. The RAG substrate from Phase 3 becomes the
agent's retrieval surface via three discrete tools — no pre-injected
catalog, no naive RAG running underneath.

| Feature | Status |
|---|---|
| Custom function-calling — user-defined tool schemas | ✦ ☐ |
| Tool execution model (sandboxing, CSP interaction) | ✦ ☐ |
| **Tool-capability detection** — `ModelInfo.toolCalls?: boolean` resolved per-model via provider metadata (OpenRouter `supported_parameters`) → id-pattern fallback (gpt-4*, claude-3*, gemini-2*, llama-3.1+, qwen2.5+, deepseek-v3, …) → manual user override in Settings. KnowledgeChip's `agent` mode is disabled with a hint when the bound chat model lacks tools. | ✦ ☐ |
| **Knowledge tools** — `list_libraries()`, `list_documents(library)`, `search_knowledge(library, query, topK?)`. Replaces the earlier "knowledge map injection" idea; pre-injecting doesn't scale to large knowledge bases and burns tokens on turns that don't need it. A tiny system-prompt nudge ("you have N libraries; use list_libraries to see them") points the model at the tools without paying for the catalog upfront. | ✦ ☐ |
| **Agentic search loop** (RAG Layer 3) — KnowledgeChip becomes a 3-mode picker per chat: **off / RAG / agent**. Modes are mutually exclusive — naive RAG is skipped entirely when agent mode is on (the agent retrieves what it needs; pre-injection would be redundant and a competing context signal). Agent mode optionally scopes the visible libraries; default is all. | ✦ ☐ |

### RAG layering (reference)

Four layers of retrieval sophistication, from cheapest to most powerful:

| Layer | What | Phase |
|---|---|---|
| **0** | Knowledge tools — `list_libraries`, `list_documents`, `search_knowledge` exposed to the agent. Replaces pre-injected catalogs. | Phase 4, paired with Layer 3 |
| **1** | Naive embed retrieval — user message → embed → top-K → inject | ✅ Phase 3 Part 1 |
| **2** | Query rewriting — LLM reformulates the message before embedding | Phase 3 Part 2 |
| **3** | Agentic search — model drives retrieval via tools, loops across turns | Phase 4 |

Modes are picked per chat (off / RAG / agent) and are **mutually
exclusive**: agent mode replaces RAG rather than augmenting it.
- RAG path uses Layer 1 (optionally Layer 2 if query rewriting is on).
- Agent path uses Layer 3 + the Layer 0 tools.
- Both paths carry their own provenance, so neither needs a separate
  always-on catalog injection.

### Phase 5 — Polish + Companion proxy

| Feature | Status |
|---|---|
| Artifact preview — sandboxed HTML/code render pane | ✦ ☐ |
| Embedding vector-map visualization (2D projection) | ✦ ☐ |
| Voice input, i18n, virtual scrolling | ☐ |
| Light mode / theming — color tokens via CSS variables | ✦ ☐ |
| Installable PWA — web app manifest + service worker for an offline app shell (model weights already persist via the Cache API) | ✦ ☐ |
| Thinking-mode handling (`<think>` tags) | ☐ |
| **CORS proxy companion** — optional local Go binary (`htllm-proxy`) that unlocks CORS-blocked APIs (OpenAI, Anthropic, Google). Not required for core function; purely opt-in. | ✦ ☐ |

---

## v2 prototype coverage

The standalone prototype (`prototype/v2/index.html`) is designed to:

- **Full, near-final design** — every Phase 1-3 surface: navigation shell,
  chat (with rename / system prompt / regenerate / code blocks), model picker,
  settings, Knowledge page, Storage / data manager, WebGPU block.
- **Stub only** — Phase 4-5: function-calling editor, agentic search, artifact
  preview, vector-map. These appear as navigation placeholders, not full
  screens — their requirements are not settled enough to design well.

---

## Open questions

- Markdown/highlight library choice (bundle-size tradeoff) — defer to Phase 2.
- Custom function calling: does it execute user-authored JS? If so, the
  execution + CSP model needs deliberate design before Phase 4.
- Storage manager scope split between Phase 2 (cache/data) and Phase 3 (files).
