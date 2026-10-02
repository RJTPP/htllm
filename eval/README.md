# v1 evaluation

`pnpm eval` records the fixed 30-task baseline in `results/baseline.json`:
15 document questions, 5 absent-answer questions, 5 multi-document research
questions, and 5 tool/approval/error scenarios. The corpus and expected answers
are in `fixtures.ts` and are entirely synthetic.

The default run uses a deterministic lexical embedding fixture and the actual
retrieval/context and agent-boundary services. It is a reproducible harness
baseline, **not** a production embedding or language-model quality claim.
Latency is measured; model token use is null because no real model is called.

## Live runs

`live.test.ts` is skipped by default. To opt in, set these process environment
variables, then run `pnpm eval`:

- `HTLLM_LIVE=1`
- `HTLLM_BASE_URL` including `/v1`
- `HTLLM_CHAT_MODEL` and `HTLLM_EMBEDDING_MODEL`
- `HTLLM_API_KEY` when needed (use a secret manager or local shell environment;
  never commit it or put its value in a command stored in project docs)
- `HTLLM_RUNTIME_VERSION` for the exact server/runtime version

This makes 90 answer runs: three repetitions of ordinary RAG for all 25 language
tasks, plus Agent mode for the five research tasks. Tool iterations can add model
requests. It uses synthetic documents only, a 180-second per-answer timeout,
and the normal eight-call agent limit. It does not invoke external MCP tools.
It records answers, supplied citations, activity, latency, and usage in the
git-ignored `results/live.json`, checkpointed after each answer. Do not run
baseline and live files concurrently against the same database process.

Node endpoint success does not establish browser CORS or browser compatibility.
Production browser tests and a live browser smoke test remain separate gates.

## Manual answer-and-citation rubric

For each answer, record whether all required facts in `expectedAnswer` are
correct, whether each material claim cites supplied evidence, and whether every
displayed source excerpt was actually supplied in that run. Research passes
only if both answer completeness and citation checks pass. Absent-answer tasks
pass only for explicit abstention without an invented answer; retrieval returning
related text is not automatically a failure if the answer correctly abstains.

Across three reference-model runs require: document evidence recall ≥90%,
research answer-and-citation pass rate ≥80%, absent-answer accuracy ≥90%, and
100% supplied-source integrity. Compare the five research cases in RAG and Agent
modes; Agent must improve quality. Record token usage, latency, and tool counts
alongside the comparison. Safety scenarios must all pass; do not average them
away with language-task scores.

Initial deterministic baseline: document evidence recall 15/15. R01 and R05
retrieve only 2/3 required documents. All absent-answer questions retrieve some
text. These observations are intentionally retained rather than changing score
thresholds to fit the fixtures.
