## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| **WebGPU API changes** — browser vendors modify WebGPU behavior | Low | High | Pin `@mlc-ai/web-llm` version; test on Chrome Stable and Edge before upgrading | Developer |
| **WebLLM breaking changes** — library API changes between versions | Medium | High | Lock version in package.json; no ranges. Upgrade one major at a time with verification checklist | Developer |
| **IDB storage limits** — browser evicts data under storage pressure | Low | High | Use `navigator.storage.persist()` to request persistent storage; show warning when free space is low via system rail. StorageManager now provides visibility into IDB store sizes and Cache API usage with per-cache delete controls. | Phase 1 |
| **Model download failures** — HuggingFace CDN unavailable or slow | Medium | Medium | WebLLM handles retries internally; cached models work offline; show clear error in StatusPanel | Phase 1 |
| **Vision model quality at 256KB** — compressed images lose too much detail | Medium | Low | Test with representative vision models; make compression target configurable if needed | Phase 1 |
| **Large thread performance** — 1000+ messages in one thread degrades IDB read | Low | Medium | Paginate message loading; consider virtual scrolling for message list | Phase 1 (design for it), Phase 5 (implement if needed) |
| **Provider abstraction leakage** — WebLLM-specific behavior bleeds into components | Medium | Medium | Code review enforcement; no `provider.id` branching in components; TypeScript ensures interface compliance | Ongoing |
| **Browser memory pressure** — model weights + IDB + React state exceed device capacity | Medium | Medium | System detection warns users; fit heuristics prevent loading oversized models; unload model frees GPU memory | Phase 1 |
| **Dependency supply chain** — compromised npm package | Low | Critical | Lock versions, review diffs on upgrade, minimal dependency count (6 runtime deps) | Ongoing |
| **CSP bypass** — missing or misconfigured Content-Security-Policy | Low | High | CSP defined in layout template, applied to all pages; no `unsafe-eval` or `unsafe-inline` for scripts | Phase 1 |
| **IDB migration failure** — upgrade from v1→v3 fails on existing user data | Low | High | Migration is additive (new stores/indexes only); no destructive schema changes. Test with fake-indexeddb before releases. | Developer |
| **Shiki bundle size** — syntax highlighter adds to initial load | Low | Medium | Shiki is lazily initialized on first code block render; not in critical path. Tree-shake unused languages if needed. | Developer |
| **BYOK key exposure** — browser extensions or XSS could read IDB | Low | High | CSP prevents third-party scripts; IDB is same-origin only; warning dialog alerts user before key save. Cannot protect against malicious extensions (documented limitation). | Phase 2 |
| **Cache API quota** — model weights fill available storage | Medium | Medium | Storage manager UI shows cache usage and provides per-model delete. `navigator.storage.estimate()` warns when quota is tight. | Phase 2 |

---

## 10. Summary

### Design Posture

Phase 1 established the structural foundation; Phase 2 expanded it with BYOK providers, rich chat features (markdown, thinking mode, edit/regenerate, copy), organizational tools (folders, command palette, storage management), and a comprehensive performance audit. The architecture's layered design and provider abstraction proved their value — Phase 2 providers were added without UI changes beyond the provider config.

### Unresolved Decisions

| Decision | Trigger for Resolution |
|---|---|
| Service Worker for offline caching | Phase 5 or when users request offline mode |
| Virtual scrolling for long threads | Performance testing with 1000+ messages |
| Default accent color selection | Currently amber; may change based on user feedback |
| Phase 3 RAG architecture | Embeddings store + vector search design needed before Phase 3 |

### Implementation Readiness

Phase 1 + Phase 2 are implemented and verified. The design covers:

- All component boundaries and responsibilities (Section 6.1, 12)
- Data model and IDB schema (Section 11)
- UI layout and interaction flows (Section 13)
- Provider contract and worker architecture (Sections 5.7, 5.8)
- All hard constraints are structurally enforced (Section 6.4)

**Verification checklist:**

- [x] `pnpm typecheck` clean
- [x] `pnpm build` produces static `dist/` with no Node-only chunks
- [x] No `localStorage.set` for anything beyond trivial UI prefs
- [x] No API-key-shaped strings in source
- [x] WebGPU detection works on Chrome/Edge desktop
- [x] At least one model loads end-to-end via WebLLM provider
- [x] Threads persist across page reload
- [x] No console errors on clean load
- [x] BYOK providers connect and stream responses
- [x] Folders and command palette function correctly
- [x] Storage manager shows cache entries and IDB stats
- [x] Accent color persists across sessions and applies to landing page
