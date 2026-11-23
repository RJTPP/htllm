# htllm v1 — Chat, simple RAG, optional agents

> **Status (2026-11-23):** the v1 scope is built, and the "Agent toggle" became the
> Chat/Workspace modes (plan and progress: [review/2026-11-23.md](review/2026-11-23.md)).
> The release gates were revised the same day; the original gates are kept below for
> the record.

The delivery scope is a static browser application with IndexedDB persistence,
one optional document library per conversation, and an Agent toggle that defaults
off. HTTP models may use tools; WebLLM retains chat and RAG. Implementation status
and unverified gates were tracked in `v1-progress.md` (removed in the 1.0.0 cleanup; see git history).

## Milestones

1. **Stabilize:** compaction/scrolling regressions, WebGPU isolation, safe Markdown,
   visible retrieval failures, validated transactional backups, and small
   React-independent execution/retrieval services.
2. **Simple RAG:** TXT/Markdown/text PDFs, progress/cancellation, page/section
   provenance, saved source excerpts, strict context limits, embedding validation,
   and clean indexing failure behavior. Keep hybrid/hierarchical retrieval;
   contextual retrieval remains optional and off by default.
3. **Document agents:** complete streamed tool calls, schema validation, scoped
   list/search/read tools, per-thread capability/toggle state, eight sequential
   calls, 60-second tool timeout, cancellation, and persistent activity.
4. **MCP:** official SDK Streamable HTTP client, browser bundling/CSP, selected
   external tools, explicit approval, user-granted session trust for read tools,
   no automatic retries after uncertain outcomes, and separately stored tokens.
5. **Qualification:** deterministic tests, the fixed [30-task evaluation](../eval/README.md),
   three reference-model runs, live provider/MCP checks, browser compatibility,
   onboarding, design-document reconciliation, and versioned release packaging.

## Plan to 1.0.0 (agreed 2026-11-23)

Built on the integration branch `wip/release`. Each step is a PR into it, and one final PR
goes to `dev`. License: MIT.

Release form:
- GitHub Pages at `https://rjtpp.github.io/htllm/`;
- a tagged GitHub release (`v1.0.0`) with the built site attached as a zip, for offline
  use with any static server.

The repo goes public at release, and everything is ready and verified before then.

**R1 · Clean the repo** (git history keeps everything removed) — done
1. Remove stale and prototype material:
   - `prototype/`
   - `docs/archive/`
   - `docs/architecture-review.md`, `docs/phase-3-part-2-plan.md`
   - `docs/v1-progress.md`, `docs/v1-live-evaluation.md`
   - `.agent-doc-skills/`, `skills-lock.json`
2. Rename `docs/v1-guide.md` → `docs/guide.md` and `docs/v1-compatibility.md` →
   `docs/compatibility.md`, and fix links.
3. Update `CLAUDE.md`: doc pointers, and drop the prototype rule.

**R2 · Product work**
1. System prompt (done):
   - an accurate editable default;
   - an always-added line with today's date;
   - in Chat mode, the note that the chat has no tools or file access.
2. "Add to library": send an upload to a Knowledge library, indexing the stored text and
   page offsets so PDF pages survive.
3. Narrow windows: fix the composer squeeze below about 600 px. Screenshots and a proposal
   come first.
4. QuickJS `run_js`: design it with the user (sandbox limits, file access, dependency
   approval), then build it.
5. Self-host the fonts (Geist, JetBrains Mono) instead of loading them from Google Fonts:
   no third-party request on load, and the offline zip works.
6. Icons: list every placeholder (favicon, wordmark, unknown-brand square, assistant
   avatar), show two or three concepts, apply the one chosen.

**R3 · Docs and quality**
1. Move the live eval to the Workspace tools, and run one baseline on the available model.
2. SDD: drift check, then update in place, absorbing the decisions and design from
   `docs/review/`. Then remove `docs/review/`.
3. Write a README (what, features, privacy, quick start, providers, limitations,
   development). Polish `docs/guide.md` and `docs/compatibility.md`.

**R4 · Release**
1. Version 1.0.0 in `package.json`, `CHANGELOG.md`, `LICENSE` (MIT), and release notes
   with known limitations.
2. Pages readiness:
   - Astro `base: '/htllm/'` with every app path made base-aware;
   - the build and browser suite run under `/htllm/`;
   - a GitHub Actions workflow that deploys to Pages and attaches the `dist` zip to the
     release on a `v*` tag.
   The first live deploy happens when the repo goes public.
3. Live smoke test against the gates below, including connecting to LM Studio from the
   Pages origin (Chrome local-network access, CORS). Claude runs the LM Studio Chat and Workspace
   checks; the user runs one real MCP tool and one WebLLM chat. Versions are recorded in
   `docs/compatibility.md`.
4. Final PR `wip/release` → `dev` (the user reviews and rebase-merges), then `dev` →
   `main`, the `v1.0.0` tag, and a GitHub release.

## Release gates (revised 2026-11-23)

Revised with the user after Chat/Workspace replaced the RAG-versus-agent comparison:
recall and accuracy percentages measured the old approach and no longer gate a release.

**Must pass to ship**

1. Deterministic tests, typecheck, static build and the production-CSP browser suite
   pass.
2. Safety holds and stays tested:
   - every external (MCP) call needs approval, and unknown outcomes are not retried;
   - every displayed excerpt was actually supplied;
   - Workspace file rules (read-only uploads and libraries, `/notes` only, no `..`) are
     enforced in code;
   - runaway grep patterns are stopped;
   - backups made by the app import cleanly.
3. A short live smoke test on the setups actually used, recorded with exact versions:
   - LM Studio, Chat with Automatic RAG over a library, giving a cited answer;
   - LM Studio, Workspace: attach, read, write, present, open the card;
   - one real MCP tool, called with approval;
   - one in-browser WebLLM chat (load a model, get a reply).
4. Docs match the app (SDD reconciled), and the release is packaged: version,
   changelog, and release notes listing known limitations.

**Tracked after release, not blocking**

- Answer quality: the fixed evaluation, moved to the Workspace tools, run on two or three
  models as a measurement to watch. The October numbers (evidence 45/45, absent 15/15,
  research 12/15) used the v1 tools.
- Qualifying Ollama, cloud endpoints and vLLM with exact versions. Release notes list
  them as expected to work, not verified.
- Firefox and Safari. The first release targets Chrome and Edge, and says so.

**Dropped**

- "Agent improves research quality over ordinary RAG": Chat and Workspace are separate
  modes, not competing strategies.

## Original v1 release gates (superseded)

- Fresh-user model → text PDF → cited answer → Agent → HTTP MCP workflow succeeds.
- Deterministic safety, isolation, validation, cancellation, rendering, migration,
  and backup tests pass; browser regressions pass against the production build.
- Expected evidence appears in at least 90% of answerable retrieval cases.
- Research answer-and-citation rubric passes at least 80% across three runs.
- Absent-answer accuracy is at least 90%; every displayed excerpt was supplied.
- No tested external write bypasses approval; unknown outcomes are not retried.
- Agent improves research quality over ordinary RAG; latency, usage, and calls are recorded.
- Live Ollama, LM Studio, a CORS-accessible HTTP endpoint, and real MCP are qualified
  with exact versions. Chrome/Edge are primary; Firefox/Safari HTTP-only paths are checked.
- No known data-loss defects or unfinished diagnostics remain in the released build.

## Deferred

OAuth, app-launched stdio bridges, OCR, Office files, persistent memory, branching,
MCP Apps, arbitrary scripts, reranking, separate query rewriting, local embedding
inference, and broader adapters are outside v1. Add them only after measured
failures justify the added scope. The pre-v1 phase plan is in git history (`docs/archive/pre-v1-roadmap.md`).

The existing `docs/sdd/` set predates this implementation and awaits its separately
confirmed reconciliation; do not use its older phase-specific claims as v1 status.
