# htllm v1 — Chat, simple RAG, optional agents

> **Status (2026-11-23):** this is the v1 plan and gate list. The "Agent toggle" became
> the Chat/Workspace modes; the current plan and progress are in
> [review/2026-11-23.md](review/2026-11-23.md). The release gates below still apply, with
> "Agent" read as "Workspace".

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

## Release gates

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
