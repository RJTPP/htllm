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
| OpenAI-compatible API provider — BYOK, base URL + key (covers Groq / OpenRouter / custom) | ✦ ☐ |
| Markdown rendering + code block syntax highlighting | ✦ ☐ (D3) |
| Context controls — context-window size + history window (messages attached per request) | ✦ ☐ |
| Prompt-template management UI — create / edit / delete, plus collections, search and import / export | ◐ data layer exists; no UI |
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
| Embedding via OpenAI-compatible API / Ollama — provider-served `/v1/embeddings` (D6) | ✦ ☐ |
| txt / PDF ingestion + chunking (lazy-loaded PDF parser) | ✦ ☐ |
| Vector store + similarity retrieval | ✦ ☐ |
| Knowledge page — global semantic search surface | ✦ ☐ |
| File / document manager (full Storage page) | ✦ ☐ |
| Conversation branching / tree view — pairs with edit-from-mid-conversation | ✦ ☐ |
| Persistent memory — user-facts store injected into context | ✦ ☐ |
| Context compression — summarize old turns when used context exceeds a trigger threshold; keeps recent turns verbatim (runs a local model call) | ✦ ☐ |

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
