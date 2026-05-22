## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| **WebGPU API changes** — browser vendors modify WebGPU behavior | Low | High | Pin `@mlc-ai/web-llm` version; test on Chrome Stable and Edge before upgrading | Developer |
| **WebLLM breaking changes** — library API changes between versions | Medium | High | Lock version in package.json; no ranges. Upgrade one major at a time with verification checklist | Developer |
| **IDB storage limits** — browser evicts data under storage pressure | Low | High | Use `navigator.storage.persist()` to request persistent storage; show warning when free space is low via system rail | Phase 1 |
| **Model download failures** — HuggingFace CDN unavailable or slow | Medium | Medium | WebLLM handles retries internally; cached models work offline; show clear error in StatusPanel | Phase 1 |
| **Vision model quality at 256KB** — compressed images lose too much detail | Medium | Low | Test with representative vision models; make compression target configurable if needed | Phase 1 |
| **Large thread performance** — 1000+ messages in one thread degrades IDB read | Low | Medium | Paginate message loading; consider virtual scrolling for message list | Phase 1 (design for it), Phase 5 (implement if needed) |
| **Provider abstraction leakage** — WebLLM-specific behavior bleeds into components | Medium | Medium | Code review enforcement; no `provider.id` branching in components; TypeScript ensures interface compliance | Ongoing |
| **Browser memory pressure** — model weights + IDB + React state exceed device capacity | Medium | Medium | System detection warns users; fit heuristics prevent loading oversized models; unload model frees GPU memory | Phase 1 |
| **Dependency supply chain** — compromised npm package | Low | Critical | Lock versions, review diffs on upgrade, minimal dependency count (6 runtime deps) | Ongoing |
| **CSP bypass** — missing or misconfigured Content-Security-Policy | Low | High | CSP defined in layout template, applied to all pages; no `unsafe-eval` or `unsafe-inline` for scripts | Phase 1 |

---

## 10. Summary

### Design Posture

Phase 1 establishes the structural foundation for htllm: a layered architecture with clear boundaries between UI (React components + hooks), providers (ChatProvider abstraction), data (IndexedDB repositories), and workers (Web Worker for inference). The architecture enforces the privacy guarantee structurally — there is no server to leak data to, and CSP restricts network access to known CDN origins.

### Unresolved Decisions

| Decision | Trigger for Resolution |
|---|---|
| Service Worker for offline caching | Phase 5 or when users request offline mode |
| Virtual scrolling for long threads | Performance testing with 1000+ messages |
| Image compression target (256KB vs higher) | Testing with vision models in Phase 1 |
| Built-in prompt template set | Content curation during Phase 1 implementation |

### Implementation Readiness

Phase 1 is ready for implementation. The design covers:

- All component boundaries and responsibilities (Section 6.1, 12)
- Data model and IDB schema (Section 11)
- UI layout and interaction flows (Section 13)
- Provider contract and worker architecture (Sections 5.7, 5.8)
- All hard constraints are structurally enforced (Section 6.4)

**Implementation sequence:** Follow the step-by-step plan in the implementation plan (`/Users/rajata/.claude/plans/velvet-hopping-bentley.md`): scaffold → types → system detect → data layer → worker + provider → components → pages → verification.

**Verification checklist** (from project spec):

- [ ] `pnpm typecheck` clean
- [ ] `pnpm build` produces static `dist/` with no Node-only chunks
- [ ] No `localStorage.set` for anything beyond trivial UI prefs
- [ ] No API-key-shaped strings in source
- [ ] WebGPU detection works on Chrome/Edge desktop
- [ ] At least one model loads end-to-end via WebLLM provider
- [ ] Threads persist across page reload
- [ ] No console errors on clean load
