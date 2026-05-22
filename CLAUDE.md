# CLAUDE.md — htllm

## What is this project?

htllm is a fully client-side WebGPU chat application. No server, no telemetry, no secrets in source. Models run in the browser via WebLLM in a Web Worker.

## Hard Constraints (load-bearing)

- **No server code.** `astro build` produces static `dist/`. No SSR adapter, no API routes.
- **No secrets in source.** API keys live in IndexedDB only. Never localStorage, never logged.
- **No telemetry.** No analytics, no third-party scripts, no remote logging.
- **Provider abstraction is law.** All backends implement `ChatProvider`. Components never branch on `provider.id`.
- **WebLLM in Web Worker only.** Main thread never imports `@mlc-ai/web-llm`. Worker is at `src/workers/webllm-worker.ts`.
- **IndexedDB through `src/data/` only.** No raw `idb` calls in components.
- **CSP via `<meta>` in every page.** Defined in `src/layouts/BaseLayout.astro`.

## Don't

- Don't edit `prototype/index.html` — it's the frozen behavior reference.
- Don't add OpenAI or Anthropic providers — they need a CORS relay server.
- Don't add embeddings, RAG, or agent code in Phase 1.
- Don't introduce Redux/Zustand/Jotai without concrete need.
- Don't use version ranges in dependencies — pin exact versions.

## Commands

```sh
pnpm dev        # Dev server
pnpm build      # Static build to dist/
pnpm typecheck  # Astro check + tsc --noEmit
pnpm preview    # Preview built site
```

## Architecture

Five layers, dependencies flow downward only:
Pages → Components → Hooks → Providers → Data + Workers

- `src/pages/` — Astro pages (static HTML shells)
- `src/layouts/` — BaseLayout with CSP
- `src/components/` — React components (App, sidebar, chat, providers, system, settings, ui)
- `src/hooks/` — useSystem, useThreads, useChat, useModelParams
- `src/providers/` — ChatProvider interface, WebLLM implementation, registry
- `src/data/` — IndexedDB via idb (threads, messages, keys, settings, prompt-templates)
- `src/workers/` — WebLLM worker
- `src/lib/` — Pure utilities (errors, format, fit, system-detect, image, export)

## Code Conventions

- Named exports only in `src/lib/`, `src/providers/`, `src/data/`
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- No `any` types, no `@ts-ignore` without reason
- TypeScript strict mode

## Design System

Dark-by-default. Colors: bg #0a0a0a, surface #141414, line #262626, text #e5e5e5, mute #737373, accent #f59e0b. Fonts: Geist (sans) + JetBrains Mono. Sharp corners, 1px borders.

## SDD

Full specification at `docs/sdd/` (IEEE 1016-inspired, 16 sections).
