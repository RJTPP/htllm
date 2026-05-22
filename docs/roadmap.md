# htllm — Feature Roadmap

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

---

## Phase plan

### Phase 1 — Foundation

Core local-inference chat. Mostly built; remaining items complete the core
experience before any new surface area.

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
| Vision / image attach | ◐ built, unverified |
| Prompt templates with `/` trigger | ◐ built, unverified |
| Data import / export | ◐ built, unverified |
| WebGPU block screen | ◐ gap — not implemented |
| Per-thread parameter UI (data layer exists; UI only edits globals) | ◐ gap |
| Navigation shell (Chat live; Knowledge/Storage stubs) | ✦ ☐ |
| Chat rename | ✦ ☐ |
| System prompt edit — per-thread, with a configurable global default in Settings | ✦ ☐ |
| Regenerate response | ✦ ☐ |
| First-run landing — landing shown once; returning visitors redirect `/` → `/app` via a `localStorage` flag set on app entry | ✦ ☐ |

### Phase 2 — External providers + chat quality

| Feature | Status |
|---|---|
| Ollama, LM Studio providers (localhost) | ☐ |
| Groq, OpenRouter providers (BYOK) | ☐ |
| Generic OpenAI-compatible endpoint provider | ☐ |
| Markdown rendering + code block syntax highlighting | ✦ ☐ (D3) |
| Prompt-template management UI (create / edit / delete) | ◐ data layer exists; no UI |
| Storage manager — basic (model cache list, IDB usage, clear data) | ✦ ☐ |
| Global conversation search — full-text over all threads/messages | ✦ ☐ |
| Chat folders / thread organization | ✦ ☐ |
| Edit any user message + regenerate from that point | ✦ ☐ (extends Phase 1 regenerate) |
| Keyboard-first navigation — shortcuts + command palette | ✦ ☐ |

### Phase 3 — Knowledge / RAG

| Feature | Status |
|---|---|
| `embeddings` IndexedDB store, model-tagged (D2) | ✦ ☐ |
| Embedding model support in the picker (model-type aware) | ✦ ☐ |
| txt / PDF ingestion + chunking (lazy-loaded PDF parser) | ✦ ☐ |
| Vector store + similarity retrieval | ✦ ☐ |
| Knowledge page — global semantic search surface | ✦ ☐ |
| File / document manager (full Storage page) | ✦ ☐ |
| Conversation branching / tree view — pairs with edit-from-mid-conversation | ✦ ☐ |
| Persistent memory — user-facts store injected into context | ✦ ☐ |

### Phase 4 — Agentic

| Feature | Status |
|---|---|
| Custom function-calling — user-defined tool schemas | ✦ ☐ |
| Agentic search — retrieval-driven agent loop | ✦ ☐ |
| Tool execution model (sandboxing, CSP interaction) | ✦ ☐ |

### Phase 5 — Polish

| Feature | Status |
|---|---|
| Artifact preview — sandboxed HTML/code render pane | ✦ ☐ |
| Embedding vector-map visualization (2D projection) | ✦ ☐ |
| Voice input, i18n, virtual scrolling | ☐ |
| Light mode / theming — color tokens via CSS variables | ✦ ☐ |
| Service worker offline caching | ☐ |
| Thinking-mode handling (`<think>` tags) | ☐ |

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
