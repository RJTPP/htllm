## 7. Traceability

### 7.1 Requirement/Concern to Design Mapping

| Concern | Design Coverage | Section(s) |
|---|---|---|
| C1 — Privacy enforcement | No server, no telemetry, CSP, IDB-only storage, worker isolation | 2.3, 4.2, 5.2, 6.4, 15.5 |
| C2 — Provider abstraction | `ChatProvider` interface, registry pattern, isolated provider folders | 5.4, 5.7, 6.1, 16.1 |
| C3 — Main thread responsiveness | Web Worker for inference, postMessage bridge, async IDB | 4.1, 5.5, 5.8 |
| C4 — Data persistence | IndexedDB with 5 stores, repository layer, hooks | 5.6, 11.1–11.4 |
| C5 — Secret safety | Keys in IDB `keys` store only, never localStorage/logged | 5.6, 6.1 (Key Store), 15.5 |
| C6 — Model fit guidance | `detectSystem()`, `fitFor()`, visual badges (fit/tight/too large) | 5.8, 6.1 (System Detect, Model Fit) |
| C7 — Streaming UX | `AsyncIterable<ChatChunk>`, incremental React updates, streaming cursor | 5.7, 5.8, 6.1 (ChatProvider) |
| C8 — Static deployability | Astro `output: 'static'`, no SSR adapter, no Node-only deps | 2.3, 4.2, 6.4 |
| C9 — Phase discipline | Registry returns only WebLLM in Phase 1; no Phase 2+ imports | 6.1 (Provider Registry), 16.1 |
| C10 — Data portability | JSON export/import of all IDB stores | 6.1 (Export/Import), 12.1 |
| C11 — Vision support | Multimodal `ContentPart[]`, image compression, paste support | 5.4, 5.8, 13.3 |
| C12 — Model parameters | Per-thread `ModelParams` overrides + global defaults in settings | 5.4, 6.1, 11.1 |
| C13 — Streaming performance | rAF batching in useChat, React.memo on message/thread components | 5.10, 12.1 |
| C14 — Code highlighting perf | Shiki cache in highlight.ts, lazy init | 5.10, 6.1 (Highlight) |
| C15 — IDB schema evolution | Versioned upgrade in db.ts, non-destructive migrations | 6.2, 11.2 |
| C16 — UX consistency | CSS variable `--accent`, 8 presets, persisted to IDB | 6.1, 13.3 |

### 7.2 Coverage and Gaps

| Gap | Status | Owner | Next Action |
|---|---|---|---|
| Markdown rendering in messages | Covered | Phase 2 | Implemented with `marked` + `shiki` for code blocks |
| Offline capability (Service Worker caching) | Deferred | Phase 5 | Design service worker strategy after core is stable |
| Accessibility audit | Partial | Phase 1 | Keyboard navigation designed; screen reader testing needed post-implementation |
| Virtual scrolling for long threads | Deferred | Phase 3+ | Investigate virtualized list for threads with 1000+ messages |
| Image compression quality validation | Open | Phase 1 | Test 256KB target with various vision models; adjust if quality insufficient |

---

## 8. Design Rationale

### 8.1 Key Decisions

| Decision | Rationale | Consequence |
|---|---|---|
| **AsyncIterable for streaming** (not callbacks) | More idiomatic for `for await...of` consumption in hooks; works naturally with AbortSignal; composable | WebLLM's callback-based API needs an adapter to emit as AsyncIterable |
| **IndexedDB for all persistence** (not localStorage) | Structured data, larger capacity, async API doesn't block main thread, suitable for binary data (images in Phase 3) | Slightly more complex than localStorage; `idb` wrapper mitigates |
| **No state management library** | React built-ins (useState, useReducer, useContext) + custom hooks cover Phase 1–4 scope; avoids bundle size and conceptual overhead | If state complexity grows beyond Phase 4, may reconsider |
| **Provider abstraction from day one** | Even though Phase 1 only has WebLLM, the interface enables Phase 2 providers without UI changes | Small upfront cost for significant Phase 2 velocity |
| **Model picker as popup, not sidebar section** | Sidebar stays focused on threads (the primary navigation); popup gives models more space for search, family grouping, and params | Extra modal management; mitigated by reusable Modal component |
| **Lazy-init worker** (ref: web-llm-chat) | Worker only creates engine handler on first message, saving resources if user never loads a model | Negligible complexity; proven pattern |
| **Config diffing for model reload** (ref: web-llm-chat) | Only reload model when model ID changes; param changes (temperature, etc.) passed at inference time | Avoids expensive re-downloads when user tweaks params |
| **Image compression to 256KB** (ref: web-llm-chat) | Keeps IDB storage manageable; vision models work at this resolution | May lose detail for complex images; user can adjust in future |
| **Static-only Astro** (no SSR) | Enforces the "no server" constraint at framework level; can't accidentally add API routes | Limits dynamic routing; acceptable for this app shape |
| **rAF-throttled streaming flushes** | Per-chunk React setState caused render storms at high token rates (>100 tok/s). Accumulating deltas in a ref and flushing via rAF caps re-renders at ≤60/s. | Slightly delayed UI update (max 16ms); negligible for perceived UX |
| **Highlight cache over streaming skip** | Considered skipping highlighting during streaming. Instead, cache results so re-renders of completed blocks are instant. | Map grows with unique code blocks; cleared on tab close |
| **Lock thread switching during generation** | Prevent switching threads while streaming to avoid race conditions in useChat state | User must stop generation before switching; small UX friction |
| **CSS variable for accent color** | Hardcoded amber in Tailwind config replaced with `rgb(var(--accent) / <alpha-value>)` consumed via CSS custom property | All existing `text-accent`, `bg-accent/10` classes work unchanged; runtime-switchable |
| **Sample-based cache size estimation** | Cloning all Cache API responses (multi-GB) is too slow. Sample 5 entries, extrapolate. | Size shown is approximate; acceptable for a management UI |

### 8.2 Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Next.js** (used by web-llm-chat) | SSR-capable by default; requires explicit configuration to avoid server code. Astro's `output: 'static'` is a stronger guarantee. |
| **Zustand** for state (used by web-llm-chat) | Adds a dependency for state management that React built-ins can handle at Phase 1 scale. The spec explicitly says no state library without concrete need. |
| **localStorage** for persistence (used by web-llm-chat) | 5MB limit, synchronous API blocks main thread, no structured queries, not suitable for binary data. IndexedDB is strictly better for this use case. |
| **Custom worker protocol** | Writing a custom postMessage discriminated union adds maintenance burden. WebLLM's built-in `WebWorkerMLCEngine` ↔ `WebWorkerMLCEngineHandler` bridge handles this transparently. |
| **Service Worker for inference** (web-llm-chat supports this) | More complex lifecycle management, heartbeat monitoring needed. Web Worker is simpler and sufficient for Phase 1. Can revisit for offline support later. |
| **Callback-based streaming** (web-llm-chat pattern: `onUpdate/onFinish`) | Less composable than AsyncIterable. Can't use `for await...of`, harder to pipe through transforms. |
| **Flat model list** (no family grouping) | Doesn't scale to 50+ models in WebLLM catalog. Family grouping with search is essential UX. |
| **Skip highlighting during streaming** | Would cause visual "flash" when highlighting activates after stream ends. Cache approach gives best of both worlds. |
| **Server-side syntax highlighting** | Violates no-server constraint. Shiki runs fully client-side. |
| **Abort-and-resume on thread switch** | More complex than lock-switch. Lock approach is simpler and prevents data corruption. |

### 8.3 Tradeoff Analysis

| Dimension | Choice Made | What We Gain | What We Give Up |
|---|---|---|---|
| **Privacy vs. features** | Privacy first | Zero data leakage guarantee | No server-side features (search, sync, collaboration) |
| **Bundle size vs. DX** | Minimal deps | Smaller client bundle, fewer supply-chain risks | More manual code for state management, utilities |
| **Type safety vs. speed** | Strict TypeScript, no `any` | Catch errors at compile time | Slower initial development, more type definitions |
| **Astro static vs. Next.js** | Astro static | Architectural guarantee of no server | Smaller ecosystem, fewer starter templates |
| **IndexedDB vs. localStorage** | IndexedDB | Structured data, async, larger capacity | More API complexity (mitigated by `idb`) |
| **WebWorkerMLCEngine vs. custom protocol** | Library built-in | Zero protocol maintenance | Less control over message format |
