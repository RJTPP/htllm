# CLAUDE.md — htllm

## What is this project?

htllm is a fully client-side chat application with no backend of its own (no htllm server
or account), no telemetry and no secrets in source. Models run either in the browser through WebLLM (in a Web Worker) or
through OpenAI-compatible HTTP endpoints the user configures (Ollama, LM Studio, cloud).
Each chat is either Chat (any model, optional cited RAG over a Knowledge library) or
Workspace (tool-capable HTTP models working on a per-chat folder of files, with small
functions and MCP tools behind user approval).

Docs:
- [docs/roadmap.md](docs/roadmap.md): the plan to 1.0.0 and the release gates.
- [docs/guide.md](docs/guide.md): how to use the app.
- [docs/compatibility.md](docs/compatibility.md): what has been tested, with versions.
- [docs/sdd/](docs/sdd/index.md): the design (layers, data model, contracts), with product
  decisions D-1 to D-31 and architectural decisions in §8.1.

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

- Don't add native OpenAI or Anthropic providers — their APIs don't allow browser CORS.
  The generic OpenAI-compatible provider covers CORS-enabled endpoints.
- Don't introduce Redux/Zustand/Jotai, a DI container, an event bus or repository base
  classes without concrete need.
- Don't use version ranges in dependencies — pin exact versions. Ask before adding a
  runtime dependency.
- Don't let `docs/sdd/` drift: update it in the same PR when a decision, store or contract
  changes.

## Commands

```sh
pnpm dev           # Dev server (port 4321)
pnpm build         # Static build to dist/ (base /, also the offline zip)
pnpm build:pages   # The same with base /htllm/, for GitHub Pages
pnpm preview       # Preview the built site
pnpm typecheck     # astro check + tsc --noEmit
pnpm test          # Vitest unit tests
pnpm test:browser  # Playwright against the production build (run pnpm build first; port 4322)
pnpm test:browser:pages  # The same against pnpm build:pages
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
- `src/workers/` — WebLLM worker, regex worker (grep deadline), QuickJS worker (`run_js`)
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

Dark-by-default. Colors: bg #0a0a0a, surface #141414, line #262626, text #e5e5e5, mute #737373, accent #f59e0b. Fonts: Geist (sans) + JetBrains Mono, self-hosted from `src/assets/fonts/` (OFL, never a font CDN). Sharp corners, 1px borders.

## SDD

Specification at `docs/sdd/` (IEEE 1016-inspired, eight files, v1.0.0). `index.md` records
the baseline commit it describes. Where the code and the SDD disagree, the code wins, and the
SDD gets fixed.
