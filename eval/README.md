# Evaluation

`pnpm eval` records the fixed 30-task baseline in `results/baseline.json`:
15 document questions, 5 absent-answer questions, 5 multi-document research
questions, and 5 tool/approval/error scenarios. The corpus and expected answers
are in `fixtures.ts` and are entirely synthetic.

The default run uses a deterministic lexical embedding fixture and the actual
retrieval/context and agent-boundary services. It is a reproducible harness
baseline, **not** a production embedding or language-model quality claim.
Latency is measured; model token use is null because no real model is called.

## Live runs

`live.test.ts` is skipped by default. It asks the 25 language tasks the way the app
does, using the app's own prompts, tools and limits:

- **workspace:** a fresh Workspace chat per answer, with the fixtures mounted read-only
  as `/library/Project notes/*.md`. The model gets the Workspace prompt and file tools,
  and the call and result limits scaled to `HTLLM_CONTEXT_WINDOW`, as in the app.
  Approval-gated tools are denied. Without an embedding model, `search` is keyword-only,
  as it is in the app for a library without an index.
- **chat:** Automatic RAG over the same library, with the default system prompt. It
  needs `HTLLM_EMBEDDING_MODEL` and is skipped without one.

To opt in, set these process environment variables, then run `pnpm eval`:

- `HTLLM_LIVE=1`
- `HTLLM_BASE_URL`, including `/v1`
- `HTLLM_CHAT_MODEL`; `HTLLM_EMBEDDING_MODEL` is optional (it enables the chat mode
  and semantic search)
- `HTLLM_API_KEY` when needed. Use a secret manager or your local shell environment;
  never commit it or put its value in a command stored in project docs.
- `HTLLM_CONTEXT_WINDOW`: the model's loaded context. It defaults to 8,192; never set
  it above what the server loaded.
- `HTLLM_RUNS`: repetitions, 1 to 5 (default 1).
- `HTLLM_TASKS`: an optional comma-separated subset, such as `D01,R03`.
- `HTLLM_RUNTIME_VERSION`: the exact server and runtime version.

Each answer has a 180-second timeout. The run uses synthetic documents only and never
calls external MCP tools.

Answers, supplied citations, tool activity, latency and usage are recorded in the
git-ignored `results/live.json`, checkpointed after each answer. Do not run the baseline
and live files at the same time against the same database process.

`node eval/summarize.mjs` prints mechanical metrics per task kind and mode:
- progress;
- whether the expected documents were supplied;
- answers that cite;
- citations that don't resolve to a supplied source;
- latency, tool counts and token usage.

These metrics don't score correctness; the manual rubric below does.

Node endpoint success does not establish browser CORS or browser compatibility.
Production browser tests and a live browser smoke test remain separate gates.
The fixture documents are short, so this doesn't qualify long-document ingestion or an
embedding model's maximum input length.

## Manual answer-and-citation rubric

For each answer, record whether all required facts in `expectedAnswer` are
correct, whether each material claim cites supplied evidence, and whether every
displayed source excerpt was actually supplied in that run. Research passes
only if both answer completeness and citation checks pass. Absent-answer tasks
pass only for explicit abstention without an invented answer; retrieval returning
related text is not automatically a failure if the answer correctly abstains.

Since the revised release gates (2026-11-23, `docs/roadmap.md`), these scores are a
measurement to track across models, not a release gate. The October targets remain a
useful reference: document facts at least 90%, research answer and citation at least
80%, absent-answer abstention at least 90%, and every citation resolving to a supplied
source. The deterministic safety scenarios must all pass; don't average them into the
language scores.

## Results

**Workspace baseline (2026-11-23):**
- **Setup:** `gemma-4-26b-a4b-it` on LM Studio 0.4.28, 16,384 context (band: 8,000
  characters per result, 16 calls). No embedding model, so search was keyword-only.
- **Runs:** three runs of 25 tasks. At temperature 0 the three runs were identical, so
  the counts below are per run.
- **Scoring:** scored by hand against the rubric.

| Kind | Facts correct | Citation resolves in the app | Notes |
| --- | --- | --- | --- |
| Document (15) | 15 | 11 | D05 cites nothing. D07, D09 and D12 cite `path:1` or `path:L1-1`, which the app doesn't resolve. |
| Absent (5) | 5 abstain, none invented | n/a | A03 and A05 put tagged thinking (`<think>`, `<thought>`) into the reply text. |
| Research (5) | 5 | 1 (R01) | R02 cites in a grouped form (`[[Source a], [Source b]]`) the app doesn't parse. R03, R04 and R05 cite nothing; R05 wrote and presented a handoff note. |

Mechanics:
- No errors and no tool budget reached.
- Average calls: document 1.5, absent 5.0, research 5.2.
- Average latency: 1.6 s, 3.5 s and 6.4 s.
- Average prompt tokens: 3.8k, 11.0k and 12.4k.
- Every citation pointed to a source the model was given. The unresolved ones are other
  spellings of supplied sources, not invented IDs.

**Findings for the app:**
1. In later tool rounds Gemma writes its reasoning into the content as tags.
   - The tags are mixed: `<think>…</think>`, `<thought>…</thought>`, an opener with no
     `>`, and `<thought>` closed by `</think>`.
   - Earlier rounds send reasoning separately, which the app shows correctly.
   - The reply view only parses one leading `<think>` block, and none at all when the
     message also has separate reasoning.
2. Citation references by path with a line suffix, or grouped in one bracket, don't
   resolve.
3. Research answers often cite nothing, although every fact came from a file the model
   read.

Findings 1 and 2 are now handled in the app:
- the reply view moves every reasoning block into the thinking section;
- citations by path, name, line or range resolve when exactly one supplied source fits,
  and grouped references render one citation each.

`summarize.mjs` uses the same matching, so the baseline now has no unresolved citations.
It reports the raw tags, which stay in `answer`, as `inlineReasoning`. Finding 3 is open.

The October v1 numbers (`qwen3.6-35b-a3b`, v1 tools: evidence 45/45, absent 15/15,
research 12/15) used a different model and tool set, so they aren't comparable.

**Deterministic baseline:** document evidence recall 15/15. R01 and R05 retrieve only 2
of 3 required documents. All absent-answer questions retrieve some text. These
observations are kept as they are, rather than changing score thresholds to fit the
fixtures.
