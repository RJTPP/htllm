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

Latest local validation: 103 unit tests, 21 production-Chrome scenarios, typecheck,
static build, the deterministic evaluation harness, and 90 live reference-model
answer runs ([review](v1-live-evaluation.md)). Live evaluation is opt-in by default.
The SDD remains unchanged
pending confirmation; no release artifact has been promoted.

UI pass (2026-11-23, `feat/ui-pass`): 105 unit tests and 21/21 production-Chrome
scenarios on Chrome 157. The production-CSP scenario now ignores only the
inline-handler violation Chrome 157 reports while DOMPurify parses the untrusted
fixture in its detached document; it still fails on any other violation and
asserts the fixture's alert never fires.

Chat/Workspace (2026-11-23, `wip/workspace`, PRs #33–#58): 184 unit tests, 30
production-Chrome scenarios and the deterministic eval pass; typecheck is clean. Phases
0–3 of [review/2026-11-23.md](review/2026-11-23.md) are built; live checks were run
against LM Studio with `gemma-4-26b-a4b-it` only, and the remaining live checks are
listed in that document's §9.

Compaction follow-up: retain the original behavior and add only oversized-input
splitting plus final aggregation. Deterministic tests cover the unchanged small
input path, no output-token cap, intermediate failure, aggregation persistence,
and repeated compaction/reload. Live model validation remains pending.

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

UI polish: one composer-level Tools control enables agent execution; connection
management lives in Settings. Inline citations open saved evidence, unknown
references remain visibly unresolved, and tool activity follows the model name
before reasoning. Syntax colors are preserved with a restricted sanitizer.
Chrome fixtures cover persistence, keyboard focus, citation resolution, code
expansion, and narrow-screen dialog layout (not full mobile-app qualification).
Tools require no manual model-capability confirmation and can stay on with
Knowledge off; document calls then return no evidence without accessing a library.

Sequential document reads now use bounded cursors over exact extracted text for
new imports, with completion status and saved page/section evidence. Older
documents explicitly report their chunk-only representation; reimport is needed
for exact original text. Tests cover gap-free pagination, escaped/unicode text,
scope/cursor validation, context limits, backup round-trips and a multi-read agent.

The composer now combines document and external tools in one two-tab panel.
Automatic RAG is independent of model tool use, and both paths specify the same
exact source-ID citation syntax. Existing chats retain their previous retrieval
behavior through an undefined-setting fallback; the legacy ragEnabled field is
not reused. Browser tests cover all four Tools/RAG combinations and persistence.
The library selector reuses the shared custom picker, and Tools/RAG switches
share state, hover, focus and disabled styling. Picker selection, Escape and
focus restoration have browser regression coverage.
