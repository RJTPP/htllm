## 16. Design Decisions (Locked)

### 16.1 Architectural Decisions and Rationale

| ID | Decision | Rationale | Consequence |
|---|---|---|---|
| **AD-1** | **Static-only output** — Astro `output: 'static'`, no SSR adapter | Structurally enforces the "no server" constraint. Cannot accidentally introduce API routes or server functions. | Limits dynamic routing. All pages must be known at build time. Acceptable for this app's page count (2 pages in Phase 1). |
| **AD-2** | **ChatProvider as the single provider contract** | All backends implement one interface. Components never branch on `provider.id`. Adding a provider = one folder + one registry line. | Every new provider must fit the `ChatProvider` shape. Providers with unusual APIs (e.g., batch-only) would need an adapter. |
| **AD-3** | **WebLLM in Web Worker, not Service Worker** | Web Worker is simpler: no lifecycle management, no heartbeat, no registration ceremony. web-llm-chat's Service Worker path adds complexity for marginal benefit (slightly better WebGPU support). | Cannot reuse the worker across tabs (each tab gets its own). Acceptable for Phase 1. |
| **AD-4** | **IndexedDB for all persistence, not localStorage** | Structured storage, async API, larger capacity, supports binary data (images). localStorage is synchronous, 5MB limited, and blocks the main thread. | Slightly more complex API. Mitigated by `idb` wrapper and repository abstraction. |
| **AD-5** | **No state management library** | React's `useState`, `useReducer`, `useContext` + custom hooks cover Phase 1–4 scope. Avoids bundle size, API surface, and conceptual overhead of Redux/Zustand/Jotai. | If state complexity grows significantly beyond Phase 4, may need to reconsider. The data layer (IDB) handles persistence, reducing the state management burden. |
| **AD-6** | **AsyncIterable for streaming** (not callbacks) | More idiomatic: `for await (const chunk of provider.chat(...))`. Works naturally with `AbortSignal`. Composable with async transforms. | WebLLM's internal API uses callbacks; the provider wraps them in an AsyncIterable adapter. Small overhead. |
| **AD-7** | **Model picker as popup, not sidebar** | Sidebar stays focused on threads (the primary navigation action). Popup gives models more room for search, family grouping, parameter controls, and loading status. | Additional modal management. Mitigated by reusable Modal component and consistent Escape/backdrop-click dismiss. |
| **AD-8** | **Library-managed worker protocol** | Use `WebWorkerMLCEngine` ↔ `WebWorkerMLCEngineHandler` from `@mlc-ai/web-llm` instead of a custom postMessage protocol. | We don't control the message format. If the library changes its protocol, we upgrade the library (already locked to a pinned version). |
| **AD-9** | **Config diffing for model reload** | Only reload the model when `modelId` changes. Parameter changes (temperature, top_p) are passed at inference time without reload. Pattern proven in web-llm-chat. | Reduces unnecessary re-downloads. Users can freely adjust params between messages. |
| **AD-10** | **Per-thread model params with global defaults** | Two levels: global defaults in `settings` store, per-thread overrides in thread record. Active config = merge (thread wins). | Slightly more complex param resolution. But enables different temperature/topP per conversation, which is valuable for experimentation. |
| **AD-11** | **Named exports only** in `src/lib/`, `src/providers/`, `src/data/` | Improves tree-shaking discoverability. Default exports make it harder to track usage and refactor. | Components may still use default exports (React convention). The rule applies to non-component code only. |
| **AD-12** | **Conventional Commits** | Structured commit messages enable automated changelog, version bumps, and clear history. | Requires discipline. Enforced by convention, not tooling in Phase 1. |
| **AD-13** | **rAF-throttled streaming state flushes** | Per-chunk setState at >100 tok/s causes React render storms. Accumulate deltas in a ref, flush via requestAnimationFrame. Caps UI updates at ≤60/s. | Max 16ms delay in token display; imperceptible. Proven approach from high-throughput UIs. |
| **AD-14** | **Highlight cache (Map) over streaming skip** | Considered skipping code highlighting during streaming. Cache approach: highlight once per unique code block, reuse on re-renders. | Memory grows with unique blocks; acceptable for tab lifetime. No visual flash when streaming completes. |
| **AD-15** | **Lock thread switching during generation** | Prevent thread switch while streaming to avoid race conditions in useChat state (refs, abort controller, message array). | Small UX friction; user must stop before switching. Eliminates a class of subtle state bugs. |
| **AD-16** | **CSS custom property for accent color** | `--accent` in `:root` consumed via `rgb(var(--accent) / <alpha-value>)` in Tailwind config. Runtime-switchable without rebuild. | All Tailwind opacity modifiers (`text-accent/60`, `bg-accent/10`) work unchanged. 8 presets persisted to IDB. |
| **AD-17** | **Sample-based Cache API size estimation** | Cloning all responses in multi-GB caches is prohibitively slow. Sample 5 entries, compute average size, multiply by total count. | Displayed size is approximate; acceptable for management UI. |
| **AD-18** | **Dynamic import for @mlc-ai/web-llm** | Static import pulls multi-MB WASM module into main bundle. Dynamic `import()` in provider code loads only when WebLLM is used. | First model load pays import cost; negligible since model download dominates. |
| **AD-19** | **OpenAICompatibleProvider subsumes all HTTP providers** | Instead of separate Ollama/LM Studio/Groq/OpenRouter classes, one spec-driven provider handles all OpenAI-compatible endpoints. Registry specs define per-provider defaults. | Single codebase for all HTTP providers. Provider-specific quirks handled via spec flags. |

### 16.2 Deferred Decisions

| Decision | Trigger | Notes |
|---|---|---|
| **Service Worker for offline caching** | Phase 5, or user demand for offline mode | web-llm-chat has a Service Worker with Serwist-based caching. We can adopt a similar approach. |
| **Virtual scrolling for long message lists** | Performance testing with 1000+ messages | If IDB read + render is slow, add virtual scrolling (react-window or similar). |
| **State management library** | If state complexity exceeds React built-ins in Phase 4+ | Zustand would be the likely choice (small, hook-based). |
| **Markdown rendering library** | Resolved | Resolved: Shiki for syntax highlighting, custom markdown parser (no `marked` dependency) |
| **Voice input** | Phase 5 | Web Speech API. Availability varies by browser. |
| **i18n framework** | Phase 5 | Likely a lightweight solution; web-llm-chat uses a custom i18n system with per-locale TypeScript files. |
| **Thinking mode** (Qwen3 `<think>` tags) | Resolved | Resolved: Dual-path — structured `reasoning` field from API + `<think>` tag parsing for local models |
| **Cross-tab IDB synchronization** | Post-Phase 1, if users report issues with multiple tabs | BroadcastChannel API or storage event listener. |
| **Model weight upload** | Phase 2+, secondary priority | Allow users to provide custom model weights instead of downloading from CDN. |
| **Generic OpenAI-compatible endpoint** | Resolved | Resolved: `OpenAICompatibleProvider` with spec-driven registry |
