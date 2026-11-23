# htllm v1 — Chat, simple RAG, optional agents

> **Status (2026-11-23):** the v1 scope is built, and the "Agent toggle" became the
> Chat/Workspace modes (plan and progress: [review/2026-11-23.md](review/2026-11-23.md)).
> The release gates were revised the same day; the original gates are kept below for
> the record.

The delivery scope is a static browser application with IndexedDB persistence,
one optional document library per conversation, and an Agent toggle that defaults
off. HTTP models may use tools; WebLLM retains chat and RAG. Implementation status
and unverified gates are tracked in [v1-progress.md](v1-progress.md).

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
failures justify the added scope. The old phase plan is [archived](archive/pre-v1-roadmap.md).

The existing `docs/sdd/` set predates this implementation and awaits its separately
confirmed reconciliation; do not use its older phase-specific claims as v1 status.
