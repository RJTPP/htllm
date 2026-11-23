# Phase 3 Part 2 — Design Memo

> **Status (2026-11-23):** partly implemented. Chunking (D8), compaction (D10) and a
> simplified PDF import (D9) shipped. Persistent memory (D11), query rewriting and the
> utility-model slot did not, and remain deferred. The current plan is
> [review/2026-11-23.md](review/2026-11-23.md).

Status: **planning** · Branch target: `phase-3-part-2` (off `phase-3-rag` once
merged to `dev`).

This memo records the design choices for Phase 3 Part 2 — chat-side knowledge
features that extend the shipped library/RAG substrate. Each section condenses
research findings (5 parallel research passes, see Appendix) into a concrete
implementation plan. Roadmap entries link back here for rationale.

The four features ship independently and can land in any order. GraphRAG is
explicitly **out of scope** with rationale recorded for future revisit.

---

## Design selections (TL;DR)

| Feature | Selected approach | Why |
|---|---|---|
| **Chunking** | Parent-child recursive (400 child / 1500 parent, 15% overlap) + opt-in Contextual Retrieval | Production winner in 2026 benchmarks; Contextual Retrieval gives 35-49% retrieval lift for free on-device |
| **PDF ingestion** | pdfjs-dist 5.x in a worker; geometry-based extraction (column detect + header/footer strip); OCR detect-and-banner, never auto | Only viable browser library; 80/20 layout wins without table extraction rabbit hole |
| **Context compression** | Auto at 75% window, 25% recency budget, 5-element summary prompt, hard cap 5 compactions/thread, token meter + inline divider UI | Conservative trigger respects small local context windows; UI pattern stolen from Cursor + Cline |
| **Persistent memory** | Mem0-lite — flat IDB facts list, end-of-turn extraction debounced every 3 turns, top-8 retrieval, `<user_memory>` injection | Simpler than Letta/graph; suits personal-scale (~1000 facts/year); reuses existing embedding pipeline |
| **GraphRAG** | **Skipped.** Agentic search (Phase 4) covers most multi-hop wins on-demand. If revisited later: HippoRAG-style, not MS GraphRAG | MS GraphRAG = ~17.6k tokens/doc indexing → ~16 hrs local compute for 100 docs. Incompatible with browser constraint |

---

## 1. Chunking refactor (Layer 1 quality upgrade)

### Approach: Parent-child hierarchical recursive

- **Child**: 400 tokens, 60-token overlap (~15%), token-aware
- **Parent**: 1,500-2,000 tokens, no overlap
- **Boundary order**: markdown headings → paragraphs → sentences → token-bounded
- **Retrieval flow**: vector search over children → dedupe parent IDs → fetch parents → assemble context

Rationale: Vecta Feb 2026 benchmark put recursive 512-token splitting at #1
(69% accuracy), beating semantic chunking (54%). Parent-child resolves the
precision/context tradeoff — small chunks for retrieval precision, large
parents for LLM context. Trivial to implement in IndexedDB.

### Add: Contextual Retrieval (opt-in per library)

For each chunk, run a small local LLM call producing a 50-100 token blurb
situating it in the parent doc. Prepend the blurb before embedding.

Anthropic's evals: contextual embeddings cut retrieval failure 35%; combined
with BM25, 49%. For htllm, cost is wall-clock during library build, not API
dollars — free on-device via WebLLM. Surface as a per-library toggle:
"Generate contextual summaries (slower, better retrieval)."

### Schema impact

```
parents store: { id, libraryId, text, tokenCount }
chunks store:  add parentId FK
```

No migration risk to existing data — new libraries opt in, existing libraries
keep flat chunking until re-embedded.

### Explicitly skipped

- **Semantic chunking** (embedding-boundary detection): 14× slower than
  recursive, no quality lift in benchmarks.
- **Late chunking** (Jina): requires long-context embedder (8K+) that htllm
  doesn't ship. Revisit if we add Jina v3 / nomic-embed-text-v1.5.

---

## 2. PDF ingestion

### Library: pdfjs-dist 5.x

Lazy-loaded inside a dedicated ingest worker. Skip unpdf (worker-inlining
optimized for serverless, wrong for browser), Docling/Marker (Python-only,
no browser builds), pdf-parse (Node-only).

Bundle: ~350 KB gzip core + ~700 KB gzip worker. Both must be lazy — never
in initial bundle.

### Extraction strategy: text + geometry

Use `page.getTextContent()`. Each item carries `str`, `transform` matrix,
`width`, `height`, `hasEOL`. Reconstruct structure from positions:

- **Reading order**: sort items by y desc, then x asc
- **Multi-column**: 1-D k-means on x-positions per page (k=2 or k=3)
- **Header/footer strip**: text appearing in top/bottom ~8% margin band on
  >40% of pages

Skip in v1: heading-by-font-size, table reconstruction, layout-aware mode.
The 80/20 win is column detect + header/footer strip.

### OCR: detect-and-banner, never auto

Detection: if `getTextContent().items.length` is near zero but the page
renders pixels, it's scanned. Show banner: "This PDF appears to be scanned.
Enable OCR? (adds ~2 MB)"

Tesseract.js v6 is the only realistic browser option. ~10-30 sec/page at
300 DPI. Likely punt for v1 — for 100+ page scans it's unusable. Document
the limitation in the banner.

### Tables: explicit punt

No production-quality browser table extractor exists. Extract table cells as
positioned text and let the LLM reason over them. Add TODO and move on.

### Chunking after extraction

Concatenate cleaned per-page text into a single string, then run the
chunker from §1. **Don't chunk by page** — pages cut mid-sentence and hurt
retrieval. Attach `{page_start, page_end, doc_id}` metadata per chunk so
citations work.

### Pipeline

Two workers: pdfjs's own `pdf.worker.mjs` (internal) + our
`pdf-ingest-worker.ts` that drives extraction and chunking. Batches of 4-8
pages with `Promise.all`, `await` between batches. Call `page.cleanup()`
after each page; `pdfDoc.destroy()` at end (memory hygiene).

Throughput: ~50-100 pages/sec text-native on M-series, ~10-20 pages/sec
mid-range. 500-page PDF ingests in ~30s. Stream `{phase, page, total}`
events to UI.

---

## 3. Context compression

### Trigger: 75% of context window (auto) + manual button

Token-counted, not message-counted. Configurable per-thread (advanced
setting). 75% chosen as middle ground — Claude Code uses ~83% but community
advice is to manually compact at ~60% for quality. Small local models
degrade earlier than frontier models.

Manual "Compact now" button always available (Cursor / Cline / Amp pattern).
Manual compaction reliably beats auto for quality.

### Recency window: 25% of context window verbatim

Token budget, not turn count. Floor: last 2 user/assistant pairs. **Always
preserve the most recent user turn** intact — it's the active intent.

Scales correctly across model sizes: 8k of a 32k window, 1k of a 4k window.

### Summary prompt (5-element structure)

Synthesized from Claude Code, Codex, and Anthropic API defaults:

```
You are summarizing a conversation so it can continue in a smaller context.

Preserve in this order:
1. The user's original goal and any explicit constraints/preferences.
2. Key decisions made and their rationale.
3. Facts established (file paths, identifiers, error messages, API shapes)
   — keep VERBATIM, do not paraphrase.
4. Code blocks the user authored or asked about — keep verbatim if short;
   otherwise keep signatures + one-line description.
5. Current state: what is done, what is in progress, what is next.

Drop: small talk, retracted ideas, intermediate reasoning the user did not
act on. Do NOT invent details. If uncertain, omit.
Output a single <summary>...</summary> block under 800 tokens.
```

Keep tool-call JSON verbatim as cheap insurance for Phase 4. User-overridable
in Settings (Claude Code's `compactPrompt` pattern).

### Re-compaction: replace, never stack

Quality decays multiplicatively across stacked summaries. Feed prior summary
verbatim into new prompt with instruction "Treat the existing summary as
ground truth; only add information from new turns below."

**Hard cap at 5 compactions per thread.** Warn at 3, force "New Chat"
recommendation at 5.

### UI

- **Token meter** in chat header: `8.2k / 32k (26%)`, color tiers green
  (<50%) / amber (50-75%) / red (>75%)
- **Inline divider** after compaction: `── summarized 14 turns
  (3.1k → 480 tokens) ──`, click-to-expand reveals dropped messages
- **Original messages stay in IndexedDB** — never deleted, only excluded
  from prompt
- **Setting**: on / manual-only / off (default on)
- Spinner with "Compacting context…" during the call (5-15s on small local
  model — silent latency reads as a hang)

### Model choice

Default: same loaded WebLLM model (user already paid the load cost). Option:
"Summarize with a different provider" — route to a configured BYOK provider.
One frontier-model call per compaction is cheap and dramatically higher
quality.

Persist summaries to IndexedDB alongside the thread. Don't recompute on
reload.

---

## 4. Persistent memory

### Architecture: Mem0-lite, single tier, flat facts list

Skip Letta-style core/recall/archival hierarchy and Zep-style episodic
groups. For personal chat at ~1000 facts/year, flat list + vector index is
sufficient. Reuses the embedding pipeline already shipped for libraries.

### Extraction: end-of-turn, debounced every 3 turns

Per-turn extraction doubles inference cost. End-of-session is too lossy
for a closeable web tab. Every-3-turns is the sweet spot. Also triggered
on explicit "remember this" intent (future enhancement).

Prompt shape (Mem0's `ADDITIVE_EXTRACTION_PROMPT`):

- JSON-mode output, array of self-contained facts (15-80 words each)
- `attributed_to: user|assistant` field per fact
- Ground dates to observation time
- Skip phatic content

Runs on the loaded WebLLM model — no extra model load.

### Update: vector top-5 + single ADD/UPDATE/DELETE/NONE call

For each extracted candidate, vector-search top-5 similar existing facts.
One LLM call per candidate returns `ADD | UPDATE | DELETE | NONE` with
`old_memory` preserved for audit log.

### Retrieval: top-8 by `0.7·cosine + 0.3·recency`

At chat start, fetch top-8 facts, inject into system prompt inside a fenced
`<user_memory>...</user_memory>` block. Cap at ~500 tokens. Only curated
facts, never raw episodes.

### Schema

```
memories store: {
  id, text, attributed_to: 'user' | 'assistant', embedding,
  createdAt, updatedAt, lastAccessedAt, accessCount,
  sourceThreadId, sourceMessageId,
  status: 'active' | 'archived',
  supersedes?: id[]
}
```

### UI (stolen from ChatGPT)

- **Inline toast** on write: "Memory saved" with one-click undo (highest-
  value affordance — users hate silent writes)
- **Manage Memories** screen in Settings: list, edit-in-place, delete,
  "forget all from this chat"
- **Per-thread toggle**: "Don't update memory in this chat" (htllm's
  Temporary Chat analog)
- **Global on/off** + **review-before-save mode** for privacy-conscious
  users
- **Show what was injected**: collapsible "Memory used (3 facts)" chip on
  assistant messages, builds trust and exposes bad facts for one-click
  delete

### Security: extract from user turns only (default)

ChatGPT memory has been a notorious prompt-injection vector — RAG-injected
content surfaced via assistant turns can poison memory. Gate
`assistant`-attributed extraction behind an explicit opt-in setting.

### Deferred to v3+

- Procedural memory (self-editing persona)
- Graph/entity linking
- Episodic summaries grouped by time period
- Letta-style core/archival hierarchy

---

## 5. GraphRAG — explicitly out of scope

**Decision: skip.** Recorded here so we don't relitigate.

Cost model fundamentally incompatible with browser-only constraint:

- MS GraphRAG: ~17.6k tokens per doc at indexing time (4-6 LLM calls per
  chunk, ~4× expansion via extraction + gleaning + summary refinement)
- 100-doc personal KB → ~1.7M tokens upfront → ~16 hours of WebLLM compute
  on M-series
- Small models do entity extraction noticeably worse than GPT-4o-mini
  (where the published quality numbers come from)

Where graph would win (and we accept the gap):

- Global / sensemaking ("summarize my whole library")
- Multi-hop ("which authors cite work that contradicts X")
- Aggregation / counting
- Entity disambiguation across many docs

Vector still wins on local fact lookup — the bulk of chat queries — and is
100× cheaper.

### Mitigation strategy

1. **Phase 4 agentic search covers most multi-hop wins on-demand.** Each
   query pays its own cost via iterative tool calls. No upfront construction.
   Strictly better next bet than GraphRAG given the constraint.
2. **If users hit a wall on global queries later**, add a lightweight
   HippoRAG-style layer: 1 OpenIE call per chunk (not 4-6), store edges in
   IndexedDB, run Personalized PageRank in JS at query time. No community
   summaries, no Leiden, no per-chunk gleaning. Incremental on top of the
   existing vector store, not a rewrite.
3. **Never ship MS GraphRAG indexing in-browser.** If full-fat GraphRAG ever
   becomes necessary, it would need to be a Tauri/Electron offline tool —
   out of scope for htllm's static-site constraint.

---

## Cross-cutting decisions

### "Utility model" slot in Settings

Contextual retrieval, memory extraction, and compression all use a small
fast local model as a workhorse for secondary tasks. Worth surfacing a
single "Utility model" setting (Llama 3.2 1B / Qwen 2.5 1.5B / etc.) that
all three features share, rather than each feature picking its own. Either
that, or default all three to the loaded chat model. Open question —
decide during implementation.

### BYOK fallback for secondary tasks

For all three (contextual retrieval, memory, compression), allow optional
routing to a configured BYOK provider for higher-quality results. One
toggle per feature, default off. Privacy: surfaces same trade as BYOK
chat — explicit opt-in.

### Schema additions are additive only

- `parents` store (chunking)
- `memories` store (memory)

Both stand alone. No migration risk to existing libraries / embeddings /
threads. Existing libraries continue working with flat chunking until
re-embedded.

### Privacy posture stays clean

All four features stay on-device by default. The only exfiltration is opt-in
BYOK routing for secondary tasks, with the same explicit-opt-in pattern as
BYOK chat.

---

## Locked decisions (added to roadmap)

| ID | Title |
|---|---|
| D8 | Parent-child hierarchical chunking with opt-in Contextual Retrieval |
| D9 | PDF via pdfjs-dist + geometry extraction; OCR + tables explicitly punted |
| D10 | Context compression: 75% trigger, 25% recency, replace-not-stack, 5-cap |
| D11 | Persistent memory: Mem0-lite flat IDB store, user-turn extraction default |
| D12 | GraphRAG out of scope; agentic search covers multi-hop; HippoRAG escape hatch documented |

---

## Implementation order recommendation

Independent items — ship in any order based on user demand. Suggested
priority for early users:

1. **Chunking refactor + Contextual Retrieval** — improves the existing
   shipped RAG experience immediately, no new UI surface
2. **Context compression** — unlocks long conversations on small local
   models (biggest pain point for current users)
3. **PDF ingestion** — unlocks the most common doc format
4. **Persistent memory** — new surface, more UI work, higher polish cost
5. **Query rewriting (Layer 2)** — existing roadmap item, slot wherever

---

## Appendix — research sources

Five parallel research passes informed this memo. Headline citations:

- **Chunking**: [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval), [Late Chunking (Jina)](https://jina.ai/news/late-chunking-in-long-context-embedding-models/), [Firecrawl 2026 chunking benchmarks](https://www.firecrawl.dev/blog/best-chunking-strategies-rag), NAACL 2025 Findings on semantic chunking ROI.
- **PDF**: [pdfjs-dist](https://github.com/mozilla/pdf.js), [unpdf comparison](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026), [Tesseract.js v6](https://github.com/naptha/tesseract.js), [PDF table extraction showdown](https://boringbot.substack.com/p/pdf-table-extraction-showdown-docling).
- **Compression**: [Anthropic Compaction API](https://platform.claude.com/docs/en/build-with-claude/compaction), [Context compaction research gist (badlogic)](https://gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f), Cursor/Cline/Amp/OpenCode comparisons.
- **Memory**: [Mem0](https://github.com/mem0ai/mem0) ([paper](https://arxiv.org/pdf/2504.19413)), [Letta](https://docs.letta.com/concepts/letta/), [LangMem](https://www.langchain.com/blog/langmem-sdk-launch), [ChatGPT memory injection writeup](https://embracethered.com/blog/posts/2024/chatgpt-hacking-memories/).
- **GraphRAG**: [Microsoft GraphRAG](https://github.com/microsoft/graphrag), [GraphRAG costs explained](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/graphrag-costs-explained-what-you-need-to-know/4207978), [nano-graphrag](https://github.com/gusye1234/nano-graphrag), [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG), [HybridRAG paper](https://arxiv.org/pdf/2408.04948).
