# Architecture Review — Current State + Deferred Refactors

> **Status (2026-11-23):** superseded as the current assessment by
> [review/2026-11-23.md](review/2026-11-23.md). The weakness flags below were re-checked
> there (§3.5): Flag 1 still holds, Flag 2 is partly addressed, Flag 3 got worse. The
> "do not fix" and "do not add" guidance still holds.

Status: **assessment** · Action: **defer fixes until after Phase 3 Part 2 ships**

This document records an honest assessment of htllm's current code structure
(as of branch `phase-3-rag`, ~40 commits ahead of `dev`, Phase 3 Part 1
shipped). It exists so the refactor can be picked up by a future session
without the conversation context that produced this assessment.

If you're reading this in a fresh session: read this whole doc before
proposing changes. The "What NOT to do" sections are load-bearing — there
are choices recorded here that look like missing patterns but are
deliberate.

---

## Current architecture (as-built)

### Style: relaxed layered architecture

Layers, top to bottom:

```
PAGES (Astro)      src/pages/      static shells, mount React islands
LAYOUT             src/layouts/    BaseLayout.astro, CSP meta
COMPONENTS         src/components/ React islands (App.tsx + feature dirs)
HOOKS              src/hooks/      useChat, useThreads, useKnowledge, …
PROVIDERS  ┐
           ├──     src/providers/  ChatProvider interface + impls
DATA       │      src/data/       IndexedDB CRUD per store
WORKERS    ┘      src/workers/    webllm-worker.ts (only)
LIB                src/lib/        pure utilities (any layer may import)
```

**Relaxed**, not strict. Any higher layer may import from `lib/`. Otherwise
dependencies flow downward. Components → Hooks → Providers + Data →
Workers. `lib/` is a sibling of all of them.

This is the Buschmann "Layers" pattern in its relaxed form — the
near-universal real-world variant. Strict layering creates wrapper-bloat
without quality gains. The relaxation is deliberate.

### Load-bearing invariants

These are **enforced informally today** (no lint rules). Breaking any of
them silently degrades the design.

1. **Components never call `idb` directly** — always through `src/data/*`.
   Lets the data layer evolve schema (currently v6) without UI churn.
2. **Components never branch on `provider.id`** — they hold a
   `ChatProvider` interface. Adding Ollama / LM Studio / Groq /
   OpenRouter required zero UI changes.
3. **WebLLM imports only in `src/workers/webllm-worker.ts`** — the main
   thread posts messages to a worker. The WebLLM provider in
   `src/providers/webllm/` is the worker client; UI doesn't know there's
   a worker.
4. **`src/lib/` is pure** — no React, no idb, no DOM. Modules take
   primitives in, return primitives out. Means everything in `lib/` is
   unit-testable in isolation (we don't have tests yet, but the contract
   is preserved).
5. **CSP via `<meta>` in `BaseLayout.astro`** — defined once, applies to
   every page. No SSR adapter (static-only build).
6. **No secrets in source** — API keys live in IndexedDB (`data/keys.ts`),
   never `localStorage`, never logged.

### What's working well (do not "fix")

| Aspect | Why preserved |
|---|---|
| Provider abstraction (`ChatProvider`) | Strategy pattern done right. Adding providers = one file + one registry entry. |
| Data layer isolation | Schema migrated v1→v6 without UI touch. Pays compounding dividends. |
| WebLLM worker boundary | Single import point; rest of codebase is MLC-agnostic. |
| `lib/` purity | Modules are genuinely pure. Replaceable. |
| No global state framework (Redux/Zustand/Jotai) | App is ~30 components; prop drilling + module-level subscribe-notify (used in `useLibraries`) is sufficient. **Do not add a state framework reactively.** |

### What you're NOT missing (do not add)

These look like "missing patterns" but are deliberate non-additions for
this app's scale and constraints.

- **Domain model / DDD entities** — `providers/types.ts` interfaces are
  domain enough. Don't introduce a separate domain layer.
- **Event bus / pub-sub framework** — relaxed layering + React state
  propagation + the module-level subscribe-notify in `useLibraries` is
  enough. Don't add EventEmitter / RxJS / etc.
- **Repository pattern wrappers over `data/`** — `data/*.ts` files
  already are the repository layer in spirit. Don't add a `Repository`
  base class.
- **Dependency injection container** — modules take what they need as
  arguments or imports. No InversifyJS / tsyringe.
- **Domain-specific error hierarchy** — `lib/errors.ts` is sufficient.
  Don't expand into 30 subclasses.

---

## Known weaknesses (deferred)

Three real problems, in priority order. Each has enough context here to
act on later without this conversation's memory.

### Flag 1: `App.tsx` is a god component

**Severity**: medium-high. Will block Phase 3 Part 2 work if untouched.

**Symptom**: `src/components/App.tsx` owns most cross-cutting state
(active thread, library binding, default library, remember-last toggle,
model params, system prompt, accent color, code theme, title mode, etc.)
and threads handlers down many levels via props. Every new feature
touches App.tsx.

**Why this happened**: organic growth. Each new feature needed one more
piece of top-level state, and App was the convenient place. Not
incompetence — just entropy.

**Why it's a problem now**: Phase 3 Part 2 adds compression state, memory
state, query-rewriting toggles. If they all land in App.tsx, it crosses
~1000 lines and becomes unmaintainable.

**What to do**:
1. Extract focused state-holding hooks: `useActiveLibrary()`,
   `useDefaultLibrary()`, `useAppSettings()`, `useChatBindings()`.
2. Each owns its slice + exposes actions. Lives in `src/hooks/`.
3. App.tsx becomes a thin wirer that composes hooks and passes their
   exposed state/actions down.
4. **No new state framework** — these are still vanilla React hooks
   using `useState` + the module-level subscribe-notify pattern already
   shipped in `useLibraries`.

**What NOT to do**:
- Don't introduce Redux / Zustand / Jotai.
- Don't introduce React Context for everything (it's fine for stable
  values like theme, but App.tsx state mostly isn't stable enough).
- Don't try to do this *during* Part 2 — it conflicts with feature work.

### Flag 2: Hooks layer is doing two different jobs

**Severity**: medium. Will compound as `useChat` grows in Part 2.

**Symptom**: Some hooks are **pure state holders** (`useThreads`,
`useFolders`, `useModelParams`, `useSystem`) — these are fine. Others are
**orchestrators** that pull in `data/*`, `lib/*`, `providers/*` and run
multi-step flows (`useChat`, `useKnowledge`). The orchestrators are
bigger and behave more like services masquerading as hooks.

**Why it's a problem**: As Part 2 lands compression + memory + query
rewriting, the natural home is `useChat` (which already orchestrates
history + RAG + provider streaming). It'll cross 1000+ lines easily.
The orchestration also can't be unit-tested without a React renderer.

**What to do** (after Part 2):
1. Add `src/services/` layer. Pure TypeScript modules — no React.
2. Move orchestration logic from orchestrator hooks into services:
   `chatService.send()`, `knowledgeService.ingest()`,
   `memoryService.extract()`, `compactionService.run()`.
3. Services depend on `providers/`, `data/`, `lib/`. React-free.
4. Hooks become thin wrappers: `useChat` exposes service methods +
   React state for UI bindings. Roughly:
   ```ts
   function useChat() {
     const [state, setState] = useState(...);
     const service = useMemo(() => makeChatService({ ... }), [...]);
     return { ...state, send: service.send, ... };
   }
   ```
5. **Pure state hooks (`useThreads`, `useFolders`) stay as-is.** They
   don't have orchestration to extract.

**Benefits**:
- Services are unit-testable in Node (no jsdom).
- New cross-feature flows (compression decides when to compact mid-chat;
  memory injects into pre-prompt) live cleanly in a service rather than
  threading through hooks.

**What NOT to do**:
- Don't make every hook a thin wrapper. Pure state hooks (`useThreads`
  etc.) are fine.
- Don't introduce a service base class / framework. Each service is a
  plain factory function returning an object of methods.
- Don't make services stateful classes. They take dependencies in;
  React holds state.

### Flag 3: `src/lib/` is mixing two concerns

**Severity**: low. Defensible status quo; will get worse as RAG grows.

**Symptom**: `src/lib/` mixes **infrastructure utilities** (`format.ts`,
`errors.ts`, `system-detect.ts`, `network.ts`, `image.ts`, `fit.ts`,
`highlight.ts`, `model-meta.ts`) with **domain pipeline logic**
(`chunking.ts`, `pdf.ts`, `ingest.ts`, `embed-pipeline.ts`,
`vector-search.ts`, `hybrid-search.ts`, `rag-context.ts`).

**Why it's a problem (eventually)**: Phase 3 Part 2 adds `pdf-extract`,
`parent-build`, `contextualize`, `memory-extract`, `compaction-prompt`,
maybe `query-rewrite`. `src/lib/` will hit 25-30 files mixing infra and
domain. Hard to navigate.

**What to do** (lowest priority — after services extraction):
1. Split into:
   - `src/lib/` — pure infrastructure (errors, format, network, fit,
     system-detect, highlight, image, model-meta, …)
   - `src/rag/` — RAG/knowledge domain pipeline (chunking, pdf,
     ingest, embed-pipeline, vector-search, hybrid-search,
     rag-context, contextualize, …)
   - `src/memory/` — if memory pipeline grows beyond 3-4 files
2. `src/services/chatService.ts` etc. depend on `rag/` and `memory/`
   the same way they used to depend on `lib/`.

**What NOT to do**:
- Don't split until `lib/` exceeds ~20 files. Currently 19 — borderline.
- Don't create empty stub folders "for future."
- Don't move `lib/errors.ts` or `lib/format.ts` — they stay in `lib/`.

---

## Recommended sequencing

**Order**:

1. **Phase 3 Part 2 ships first** (chunking refactor, PDF, compression,
   memory, query rewriting). See `docs/phase-3-part-2-plan.md`.
2. **Then Flag 1** — extract App.tsx state into focused hooks. Days, not
   weeks. No new dependencies. Should land as a single PR titled
   something like `refactor: split App.tsx state into focused hooks`.
3. **Then Flag 2** — add `src/services/` layer, move orchestration out
   of `useChat` and `useKnowledge`. Larger refactor (~1 week). Land in
   2-3 PRs, one per service, to keep diffs reviewable.
4. **Then Flag 3** — optional. Only if `lib/` has grown past ~25 files
   and is hard to navigate. Split rename PR.

**Anti-sequencing**:

- Don't do Flag 2 (services) without Flag 1 (App.tsx) first — services
  pull state, App.tsx still has it scattered, you'd refactor App.tsx
  twice.
- Don't interleave with Part 2 feature work. Refactors and features
  in the same PR is how regressions get hidden.

---

## What grade does the current code deserve?

**Solid B+.** Honest read:

- Better than 80% of comparable apps at this size and stage.
- The provider abstraction and data layer isolation are *good design*,
  not just "code that works." They've already paid for themselves
  (4 providers shipped, 6 schema versions migrated, no UI churn).
- The three weaknesses are **emergent from successful growth**, not
  initial bad choices. They show up because the app got bigger, not
  because the foundation was wrong.

The right time to fix them is **after Part 2**, not before. Refactoring
under feature pressure is how good designs die.

---

## Quick context for whoever picks this up

You probably opened this doc because Part 2 just landed and you want to
clean up. Some last things to know before you start:

- The CLAUDE.md "Hard Constraints" still apply during refactor. No
  server code, no secrets in source, no telemetry, provider abstraction
  is law, IDB only through `src/data/`.
- `src/lib/` purity is the **most important invariant** to preserve.
  Don't accidentally import React or call `getDb()` from a `lib/` file.
- The module-level subscribe-notify pattern in `src/hooks/useLibraries.ts`
  is the **template** for shared module-level state. Use it; don't
  invent something new.
- Pin exact dependency versions. No version ranges.
- Conventional Commits (`refactor:`, `feat:`, etc.).
