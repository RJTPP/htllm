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
- [ ] Complete delayed streaming/thread-switch browser regressions
- [ ] Broader PDF failures/cancellation and modern MCP negotiation fixture coverage
- [ ] Reconcile existing SDD (confirmation requested by documentation skill)
- [ ] Live Ollama, LM Studio, cloud model, and MCP qualification
- [ ] Chrome/Edge and Firefox/Safari HTTP-only qualification
- [ ] Three-run model quality gates and release packaging

Current baseline and limits: [evaluation](../eval/README.md),
[compatibility](v1-compatibility.md), [onboarding](v1-guide.md).
Core implementation is present; v1 is **not release-qualified**.

Latest local validation: 81 unit tests, 8 production-Chrome scenarios, typecheck,
static build, and the deterministic evaluation harness. Live evaluation is skipped
without explicit endpoint/credential/model configuration. The SDD remains unchanged
pending confirmation; no release artifact has been promoted.
