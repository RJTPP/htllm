# CLAUDE.md — htllm

## What is this project?

htllm is a fully client-side chat application. There is no server, no telemetry and no
secrets in source. Models run either in the browser through WebLLM (in a Web Worker) or
through OpenAI-compatible HTTP endpoints the user configures (Ollama, LM Studio, cloud).
v1 adds a Knowledge library (PDF/TXT/MD, cited RAG), document tools, and MCP tools with
user approval.

The current plan of record is [docs/review/2026-11-23.md](docs/review/2026-11-23.md),
which also holds the product decisions D-1 to D-31 (Chat vs Workspace modes).

## Hard Constraints (load-bearing)

Each rule stands even where the code has drifted from it. Known violations are listed so
they are fixed rather than copied.

- **No server code.** `astro build` produces a static `dist/`. No SSR adapter, no API routes.
- **No secrets in source.** API keys live in IndexedDB only. Never localStorage, never logged.
- **No telemetry.** No analytics, no third-party scripts, no remote logging. Anything
  adopted must be self-hosted from `dist/`.
- **Provider abstraction is law.** All backends implement `ChatProvider`. Components never
  branch on `provider.id`. *Known violations:* `components/providers/ModelPicker.tsx` and
  `components/ui/ProviderLogo.tsx` compare against the WebLLM id.
- **WebLLM in a Web Worker only.** No static runtime import of `@mlc-ai/web-llm` on the
  main thread; the engine runs in `src/workers/webllm-worker.ts`. Type-only imports and
  the existing dynamic `import()` calls in `src/providers/webllm/` are the allowed exceptions.
- **IndexedDB through `src/data/` only.** No raw `idb` or `getDb()` outside `src/data/`.
  *Known violations:* `lib/ingest.ts`, `lib/embed-pipeline.ts` and `lib/export.ts` call
  `getDb()` directly.
- **CSP via `<meta>` in every page.** Defined in `src/layouts/BaseLayout.astro`. Production
  forbids `eval`/`new Function` (WebAssembly and blob workers are allowed). The dev policy
  allows `unsafe-eval`, so CSP problems only show in `build` + `preview`. Do not change
  the CSP without asking the user.

## Don't

- Don't edit `prototype/index.html` — it's the frozen behavior reference.
- Don't add native OpenAI or Anthropic providers — their APIs don't allow browser CORS.
  The generic OpenAI-compatible provider covers CORS-enabled endpoints.
- Don't introduce Redux/Zustand/Jotai, a DI container, an event bus or repository base
  classes without concrete need.
- Don't use version ranges in dependencies — pin exact versions. Ask before adding a
  runtime dependency.
- Don't trust `docs/sdd/` for current behavior: it still describes Phase 2 and is
  reconciled after the Workspace work.

## Commands

```sh
pnpm dev           # Dev server (port 4321)
pnpm build         # Static build to dist/
pnpm preview       # Preview the built site
pnpm typecheck     # astro check + tsc --noEmit
pnpm test          # Vitest unit tests
pnpm test:browser  # Playwright against the production build (run pnpm build first; port 4322)
pnpm eval          # Deterministic 30-task evaluation (eval/)
```

## Architecture

Layers, dependencies flow downward; `src/lib/` may be imported by any layer:

Pages → Components → Hooks → Services → Providers → Data + Workers

- `src/pages/` — Astro pages (static HTML shells)
- `src/layouts/` — BaseLayout with CSP
- `src/components/` — React components: App, chat, workspace (side panel, viewer, cards),
  knowledge, providers, settings, sidebar, storage, system, command, landing, nav, ui
- `src/hooks/` — useChat, useThreads, useFolders, useKnowledge, useLibraries,
  useModelParams, useSystem
- `src/services/` — chat/agent execution loop, Workspace tools and uploads, document
  reader, retrieval, MCP client, approvals
- `src/providers/` — ChatProvider/EmbeddingProvider interfaces, WebLLM client,
  OpenAI-compatible provider, registry
- `src/data/` — IndexedDB via idb (DB v10): threads, messages, keys, settings,
  prompt-templates, folders, libraries, documents, chunks, parents, embeddings, summaries,
  mcp connections, workspace files and versions; mode defaults, tool overrides; reset and
  storage stats
- `src/workers/` — WebLLM worker
- `src/lib/` — utilities: chunking, PDF extraction, ingest/embedding pipelines, hybrid and
  vector search, RAG context, citations, compaction, token budgeting, sanitizing, export,
  formatting, workspace paths and text (line model, search, grep), calculator, CSV

## Code Conventions

- Named exports only in `src/lib/`, `src/providers/`, `src/data/`, `src/services/`
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`
- No `any` types, no `@ts-ignore` without reason
- TypeScript strict mode
- Tests: unit tests next to the code (`*.test.ts`, Vitest + fake-indexeddb); browser
  scenarios in `test/browser/` (Playwright, Chrome channel)

## Design System

Dark-by-default. Colors: bg #0a0a0a, surface #141414, line #262626, text #e5e5e5, mute #737373, accent #f59e0b. Fonts: Geist (sans) + JetBrains Mono. Sharp corners, 1px borders.

## SDD

Specification at `docs/sdd/` (IEEE 1016-inspired, 16 sections). Stale since May 2026; see
the plan of record above for current design.
