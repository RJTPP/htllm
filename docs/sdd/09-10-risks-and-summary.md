## 9. Risks and Mitigations

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| RK-1 | **Browser CORS and local-network access** block users from reaching `localhost` model servers from the Pages origin. | High | High: first-run failure | Clear error messages; the guide covers server CORS settings and Chrome's local-network prompt; a live smoke test from the Pages origin before release (roadmap R4.3); the zip for local hosting. | Owner |
| RK-2 | **Tool-calling quality varies by model.** Small or unusual models produce malformed calls, loops, leaked reasoning tags or missing citations. | High | Medium | Per-model detection and override; tool-call repair; repeated-call stop; call cap with "continue"; tolerant reasoning and citation parsing; the live eval per model. | Maintainer |
| RK-3 | **Prompt injection** through uploads, library documents, MCP results or tool descriptions. | Medium | High if an external write follows | All file and tool content is treated as data in the prompt; every MCP call needs approval; notes can't trigger actions; `run_js` has no network; HTML isn't rendered. | Maintainer |
| RK-4 | **Storage quota or eviction** loses data, or blocks imports and weight downloads. | Medium | High | The Storage page shows usage and offers clears; export and import; weights can be re-downloaded. | User and owner |
| RK-5 | **One-way DB migration (v10)**: users can't go back to an older build. | Low | Medium | Additive migrations with tests; a backup before upgrading; noted in release notes. | Owner |
| RK-6 | **Cross-tab writes** to the same chat from two tabs. | Low | Medium | Note edits are version-checked; one tab per chat is recommended. Coordination is deferred. | Maintainer |
| RK-7 | **QuickJS escape.** A memory-safety bug in the interpreter would run in a worker that, on Pages, has no CSP restriction and can make network requests. | Low | High | A pinned, widely used build; the guest gets no host functions with side effects; deadline, memory and stack limits; a fresh worker per call; termination as a backstop. A header-delivered worker CSP or a sandboxed iframe would add a second layer if the hosting ever allows headers. | Maintainer |
| RK-8 | **Upstream API drift** (web-llm worker protocol, MCP SDK, server metadata fields). | Medium | Medium | Exact version pins; detection treats unknown metadata as "unknown", not "no"; a browser suite on every change. | Maintainer |
| RK-9 | **Large `App.tsx` and `useChat`** slow changes and invite regressions. | Medium | Medium | New logic goes into services and small hooks; browser scenarios cover the main flows. A refactor only with a concrete need. | Maintainer |
| RK-10 | **Unverified backends and browsers** (Ollama, vLLM, cloud, Firefox, Safari) behave differently. | Medium | Medium | The release notes state they are expected to work but not verified; tracked after release. | Owner |
| RK-11 | **Base path mistakes** on Pages break workers, wasm or links under `/htllm/`. | Low | High at release | The full browser suite runs under `/htllm/` locally and in the release workflow, and checks that requests stay under the base. The WebLLM worker is only checked for its URL, because the suite has no WebGPU. | Maintainer |

## 10. Summary

htllm 1.0.0 is a static, client-only chat app with two locked modes:
- **Chat** works with any model and can use Automatic RAG over a global Knowledge
  library.
- **Workspace** gives tool-capable HTTP models a per-chat folder of uploads, notes and
  read-only libraries. File tools, small functions and approved MCP tools work on it.

The design depends on a few load-bearing rules:
- one provider contract;
- WebLLM isolated in its worker;
- IndexedDB behind `src/data/`;
- a `<meta>` CSP without eval;
- model output treated as hostile everywhere;
- file rules, approvals and limits enforced in code rather than in prompts.

**Implementation readiness:**
- The code described here is built and tested: typecheck, 212 unit tests, 39
  production-build browser scenarios, and the deterministic eval with its safety
  scenarios.
- A live Workspace baseline was recorded on Gemma 4 26B (reference R-4).

**Open items before and after release:**
- **Roadmap R4, before release:**
  - the first tagged run of the release workflow (Pages deploy and zip);
  - the live smoke tests from the Pages origin;
  - version 1.0.0, the changelog and release notes;
  - re-pointing this document's baseline after the rebase merge.
- **Known code gaps (§7.2):** the provider-id comparisons in two components, the
  `lib/` IndexedDB access, the legacy `documentTools`, and one stale comment.
- **Tracked after release:** answer quality across models (citations in research
  answers), Chat-mode RAG in the live eval, other backends and browsers, and WebLLM in
  Workspace.

**Next steps for contributors:**
1. Read §4 and §6.4.
2. Find the owning component in §6.1.
3. Check the concern it touches in §7.1.
4. Update this document in the same pull request when a decision, store or contract
   changes.
