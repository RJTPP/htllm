# Reference-model evaluation — 2026-10-03

Local qualification evidence, not a release approval. All 90 answer runs completed
without transport/tool execution errors. The harness used isolated synthetic
IndexedDB data; it did not modify the user's browser library or conversations.

## Configuration

- Endpoint: `http://localhost:1234/v1`, user-managed LM Studio proxy, no API key.
- Chat model: `qwen3.6-35b-a3b@iq4_xs`; context budget 13,312.
- Embedding model: `text-embedding-embeddinggemma-300m-qat`; user reports a
  2,048-token limit. Short fixtures only; maximum embedding input not qualified.
- Temperature 0; maximum 2,048 output tokens per model request; three repetitions.
- Exact upstream runtime/version not supplied. The proxy name is not proof of
  the upstream inference runtime. Thinking behavior was left at provider default.
- Raw local report: `eval/results/live.json` (git-ignored), SHA-256
  `b0a9aad548a20b2421a0033a204cdfdb3f58f3d6b2bf0c377bf354a8a19da834`.
- Mechanical summary: `node eval/summarize.mjs`. The raw report remains
  `manual-review-required`; the assistant's answer/citation review is below.

## Quality review

Answers were reviewed against `eval/fixtures.ts`. All repetitions had identical
answer text except a harmless citation-wording change for D02. These are repeated
temperature-zero results, not evidence of robustness across models or sampling.

| Gate | Observed result | Boundary |
| --- | --- | --- |
| Answerable document evidence | 45/45 expected documents supplied (100%) | Tiny synthetic documents |
| Absent-answer handling | 15/15 explicit abstentions (100%) | Five absence questions repeated |
| Research, ordinary RAG | 9/15 answer-and-citation passes (60%) | R01 and R05 incomplete in every repetition |
| Research, Agent | 12/15 answer-and-citation passes (80%) | R03 incomplete in every repetition |
| Agent source provenance | No saved excerpt missing from completed tool results | Does not qualify arbitrary model-generated citation syntax |

Per-case research review applies to all three repetitions:

| Case | RAG | Agent | Finding |
| --- | --- | --- | --- |
| R01 prerequisites | Fail | Pass | RAG misses the November 3 rotation date; Agent supplies all three dates with evidence. |
| R02 owners/rollback | Pass | Pass | Both name Mira Chen and Lena Ortiz and the >2% / 10-minute condition with sources. |
| R03 budgets/owner | Pass | Fail | Agent answers budgets and total but substitutes budget approver Jules Reed for the requested Atlas owner; it never retrieves Atlas evidence. |
| R04 reviewer/support | Pass | Pass | Both provide Owen Park, Arun Shah, and 15 minutes with sources. |
| R05 launch handoff | Fail | Pass | RAG misses support hours; Agent supplies the owner, approver, and 08:00–18:00 UTC coverage. |

The agent improves these research cases and meets the numerical 80% gate exactly.
Do not hide the R03 failure or tune the retrieval threshold solely to this corpus.
Any prompt/runner change should be followed by another complete comparison.

## Cost and latency

Means across the recorded research runs; usage aggregates agent model rounds.
Completion tokens include provider-reported reasoning tokens where applicable.

| Mode | Latency | Tool executions | Prompt tokens | Completion tokens |
| --- | ---: | ---: | ---: | ---: |
| RAG | 8.08 s | 0 | 206.8 | 973.8 |
| Agent | 7.09 s | 3.0 | 4,222.8 | 781.8 |

The latency difference is specific to this endpoint/run and may reflect caching
or model reasoning behavior; it is not a general performance claim.

## Separate browser smoke and remaining gates

In Chrome, the user's one-chunk `test.txt` returned the correct creation date via
RAG. Agent mode completed `list_documents` and `read_document`, returned that date,
and correctly stated that no author was specified. Source excerpt, activity,
library binding, and Agent selection survived reload. The browser smoke used the
existing 8,192-token budget, below the configured server maximum.

Still pending: exact upstream runtime version; real MCP server; Ollama and cloud
endpoint qualification; other required browsers; broader PDF cases; SDD
reconciliation and release packaging. Deterministic external-approval tests do
not replace real-server qualification. V1 is not release-qualified.
