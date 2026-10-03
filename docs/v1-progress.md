# v1 implementation gates

This checklist tracks the approved chat/RAG/agent plan. Unchecked live gates
must not be represented as a qualified release.

- [x] Safe rendering, HTTP without WebGPU, validated transactional backup/restore
- [x] Text PDF ingestion, bounded retrieval, persistent source evidence
- [x] Provider tool calling and bounded document agent
- [x] Streamable HTTP MCP and explicit external-call approval
- [x] Deterministic 30-task evaluation baseline (not live-model quality)
- [x] Production build and initial Chrome fixture tests
- [x] Regeneration and repeated manual compaction across reload in Chrome fixtures
- [x] Delayed HTTP cancellation/reload and stop-before-thread-switch regressions
- [x] Incremental streaming/scroll position browser regression
- [ ] Broader PDF failures/cancellation and modern MCP negotiation fixture coverage
- [ ] Reconcile existing SDD (confirmation requested by documentation skill)
- [ ] Live Ollama, LM Studio, cloud model, and MCP qualification
- [ ] Chrome/Edge and Firefox/Safari HTTP-only qualification
- [ ] Three-run model quality gates and release packaging

Current baseline and limits: [evaluation](../eval/README.md),
[compatibility](v1-compatibility.md), [onboarding](v1-guide.md).
Core implementation is present; v1 is **not release-qualified**.

Latest local validation: 88 unit tests, 11 production-Chrome scenarios, typecheck,
static build, the deterministic evaluation harness, and 90 live reference-model
answer runs ([review](v1-live-evaluation.md)). Live evaluation is opt-in by default.
The SDD remains unchanged
pending confirmation; no release artifact has been promoted.

Cancellation hardening: aborted HTTP requests persist as stopped, late generation
cleanup cannot clear another run's controller, and PDF cancellation during file
read or on the final page cannot report successful extraction. Mocked parser
tests cover encrypted/unreadable errors; real encrypted/complex PDF coverage
and current-protocol MCP negotiation remain pending.

Live Chrome smoke: the configured LM Studio proxy returned the test file's
creation date via ordinary RAG, then executed `list_documents` and
`read_document` in Agent mode and correctly identified the missing author.
Source excerpts, completed activity, Agent selection, and library binding
survived reload. This is a one-file smoke check, not the three-run quality gate.
Endpoint badges and onboarding now describe routing rather than claiming that
localhost guarantees on-device inference; mDNS hosts are classified as remote.
