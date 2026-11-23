# WebLLM tool calling: can Workspace mode run on in-browser models?

Date: 2026-11-23. Scope: `@mlc-ai/web-llm` **0.2.83** (the version htllm pins), checked against htllm `wip/workspace` at `1a7c36d`.

Sources: the installed package (`node_modules/@mlc-ai/web-llm/lib/index.js`, `version: "0.2.83"`), the web-llm source at tag [`v0.2.83`](https://github.com/mlc-ai/web-llm/tree/v0.2.83) (commit `8a36ea0`), the GitHub issues and PRs linked below, and the `mlc-chat-config.json` files on Hugging Face. Nothing was run. Every behavior claim comes from reading source. Claims not confirmed in source are marked **UNVERIFIED**.

Short link prefix used below: `wl@83` = `https://github.com/mlc-ai/web-llm/blob/v0.2.83`.

---

## TL;DR

- 0.2.83 accepts `tools` and returns `tool_calls`, both streaming and non-streaming. The support is narrow. Five model ids pass an allowlist, and only the three **Hermes-2-Pro** ids get the working path: an injected system prompt plus a JSON-schema grammar. On that path every reply is forced to a JSON array of calls, and the model cannot answer in prose. `tool_choice` is never read, any caller system prompt is rejected, and streamed calls carry no `id`.
- The two **Hermes-3** ids pass the allowlist but get no prompt and no grammar in 0.2.83. This was fixed in 0.2.84 ([#802](https://github.com/mlc-ai/web-llm/pull/802)).
- Every allowlisted model is 7-8B (4.0-6.1 GB VRAM), and every record pins a 4096-token context. Eight file tools plus one `read_file` result fill most of that window.
- Multi-turn loops work if each assistant turn is replayed as a **string** (the raw JSON) and each result is sent as a `role: "tool"` message. `tool_calls` and `tool_call_id` on input messages are ignored. Null assistant content throws in every release up to 0.2.89. The fix ([#890](https://github.com/mlc-ai/web-llm/pull/890)) is an open PR.
- A second path exists: **manual tool calling with `response_format: {type: "structural_tag"}`**, using XGrammar `triggered_tags`. It works with any model, allows prose, and constrains each tool's arguments to its schema. In 0.2.83 it has a known failure mode: a grammar-init error hangs the request forever (fixed in 0.2.85, [#849](https://github.com/mlc-ai/web-llm/pull/849)). It is also broken for Qwen3.5 JSON until 0.2.87 ([#876](https://github.com/mlc-ai/web-llm/pull/876)).
- **Recommendation: (a) keep Workspace HTTP-only on 0.2.83.** If in-browser Workspace is wanted later, use (c): upgrade to ≥ 0.2.85 (≥ 0.2.87 to include Qwen3.5) and build the `structural_tag` manual path for a short list of Qwen3 and Hermes models, behind an "experimental" label and a read-only tool subset. Do not build on the native `tools` path.

---

## 1. `tools` / `tool_choice` / `tool_calls` in 0.2.83

### Accepted fields
- `ChatCompletionRequest.tools` and `tool_choice` are typed ([wl@83 `chat_completion.ts` L221-L240](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/openai_api_protocols/chat_completion.ts#L221-L240)). `ChatCompletionRequestUnsupportedFields` is empty, so neither field is rejected.
- **`tool_choice` is ignored.** The compiled `lib/index.js` never reads `tool_choice`; the only references are in `.d.ts` files. In source, the one reader is `getFunctionCallUsage` ([wl@83 `conversation.ts` L524](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/conversation.ts#L524)). Its only call site is commented out (L480), so the bundler drops it. The same holds in v0.2.89 (`conversation.ts` L678/L722). `"none"`, `"required"` and named functions have no effect. Issue [#712](https://github.com/mlc-ai/web-llm/issues/712) reports the same thing ("disregards the `tool_choice` set").

### Gating and hard-coded handling (`postInitAndCheckFields`, [wl@83 `chat_completion.ts` ~L550-L595](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/openai_api_protocols/chat_completion.ts#L550))
1. **Model allowlist.** If `tools` is set and the loaded model is not in `functionCallingModelIds` ([wl@83 `config.ts` L315](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/config.ts#L315)), the request throws `UnsupportedModelIdError`: *"… is not supported for ChatCompletionRequest.tools. Currently, models that support function calling are: …"*.
2. **Hermes-2-Pro only** (`currentModelId.startsWith("Hermes-2-Pro-")`):
   - It sets `response_format = { type: "json_object", schema: <array of {name: string, arguments: object}> }`. This is JSON mode via XGrammar. A caller-supplied `response_format` throws `CustomResponseFormatError`.
   - It prepends its own system prompt, `hermes2FunctionCallingSystemPrompt` ([wl@83 `support.ts` L116](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/support.ts#L116)), with `JSON.stringify(request.tools)` embedded in `<tools>…</tools>`. **Any caller system message throws** `CustomSystemPromptError`: *"When using Hermes-2-Pro function calling via ChatCompletionRequest.tools, cannot specify customized system prompt."*
3. **Hermes-3 ids**: they pass the allowlist, but in 0.2.83 they get neither the prompt nor the grammar. The model receives its default "You are Hermes 3…" system message and never sees the tools, unless the caller writes them into the system prompt. Its output is still parsed as a JSON array (see below), so prose fails. [PR #802](https://github.com/mlc-ai/web-llm/pull/802) ("OpenAI function calling generates refusals while manual calling works fine") extended the Hermes-2-Pro handling to `Hermes-3-` in **0.2.84** (commit [`5248cd10a7`](https://github.com/mlc-ai/web-llm/commit/5248cd10a7)).

### Output
- **The grammar forces every reply to be a JSON array**, and there is no prose branch. When generation stops with `finish_reason === "stop"` and `tools` was set, the engine sets `finish_reason = "tool_calls"` and parses the output with `getToolCallFromOutputMessage` ([wl@83 `support.ts` L129+](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/support.ts#L129)). It does this **even for `[]`**, which yields `finish_reason: "tool_calls"` with `tool_calls: []`.
- A non-streaming reply returns `message: { content: null, tool_calls }` ([wl@83 `engine.ts` ~L868-L900](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/engine.ts#L868)). Ids are `"0"`, `"1"`, … (array index as a string).
- **Streaming is supported, but not as OpenAI streams it.** Intermediate chunks carry the **raw JSON text as `delta.content`**. The **last chunk** carries `delta.tool_calls` with `index`, `type` and `function` but **no `id`** ([wl@83 `engine.ts` ~L640-L670](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/engine.ts#L640); the `.d.ts` says "the last chunk would contain the `tool_calls` field, while the intermediate chunks would contain the raw string").
- If generation ends with `length` or `abort`, no `tool_calls` are returned; only the raw string is.
- If parsing fails (possible for Hermes-3 in 0.2.83, which has no grammar), it throws `ToolCallOutputParseError` / `ToolCallOutputInvalidTypeError` / `ToolCallOutputMissingFieldsError` at the end of the stream.
- The grammar constrains only the shape `{name: string, arguments: object}`. Tool names are free strings, and arguments are not checked against each tool's schema, so the model can call tools that do not exist with any arguments.
- `tools` with plain `completions` throws *"Expect `chat.completions` with tools, not `completions`."*

## 2. Function-calling models in 0.2.83 `prebuiltAppConfig`

From the installed `lib/index.js`. VRAM is `vram_required_MB` at the default context. The "Native ctx" column comes from each model's `mlc-chat-config.json` on HF **`main`** (unpinned, fetched 2026-11-23).

| model_id | VRAM (MB) | ctx in record | Native ctx (HF config) | Prompt + grammar in 0.2.83 |
|---|---|---|---|---|
| `Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC` | 4976 | 4096 | 8192 | yes |
| `Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC` | 6051 | 4096 | 8192 (UNVERIFIED for f32, same family) | yes |
| `Hermes-2-Pro-Mistral-7B-q4f16_1-MLC` | 4033 (needs `shader-f16`, `sliding_window_size: -1`) | 4096 | -1 in HF config | yes |
| `Hermes-3-Llama-3.1-8B-q4f32_1-MLC` | 5779 | 4096 | 131072 (UNVERIFIED for f32, same family) | **no** (fixed in 0.2.84) |
| `Hermes-3-Llama-3.1-8B-q4f16_1-MLC` | 4876 | 4096 | 131072 | **no** (fixed in 0.2.84) |

These ids are **not** allowlisted even though they are in the catalog: `Hermes-3-Llama-3.2-3B-*` (2264 / 2952 MB), `Hermes-2-Theta-Llama-3-8B-*`, and all Qwen3, Qwen3.5, Qwen2.5 and Llama-3.x models. The list is unchanged in 0.2.89.

All three HF conv templates (`hermes2_pro_llama3`, `open_hermes_mistral`, `hermes3_llama-3_1`) define a `tool` role (`<|im_start|>tool`). htllm already passes a `context_window_size` override at `reload`. Whether 8192 fits in VRAM on typical GPUs with the `_cs1k` libs is **UNVERIFIED**. When `sliding_window_size == -1` (every record here) and the prompt plus the filled KV cache exceed `context_window_size`, prefill throws `ContextWindowSizeExceededError` (verified in `lib/index.js`, `LLMChatPipeline.getInputData`). It does not slide.

**Rough budget, estimated by eye:** the eight Workspace file tools are **not in this worktree at `1a7c36d`**; `src/` has no `list_files` or `edit_file`. This is therefore an estimate, not a measurement. htllm's three current document tools serialize to about 900 chars (~230 tokens). Eight file tools with richer schemas (`write_file` content, `edit_file` old/new, `grep` pattern/glob) would take about 1.0-1.5k tokens. Add the Hermes prompt (~130), a user turn, one `read_file` result (`agent.ts` caps these at 8000 chars, ~2k tokens) and 512 response tokens, and 4096 holds roughly **one or two tool rounds**. With MCP tools added, it is worse.

## 3. Multi-turn loops

`getConversationFromChatCompletionRequest` ([wl@83 `conversation.ts` ~L480-L515](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/conversation.ts#L480)):
- The last message must be `user` or `tool` (`MessageOrderError`). A `tool` last message is prefilled as `Role.tool`.
- **Assistant messages must have string `content`**, otherwise `ContentTypeError` (*"assistant's message should have string content."*). `tool_calls` on an assistant message is **never read**. To replay a call turn, send the raw JSON array as `content`. This is unchanged in 0.2.89 ([wl@89 `conversation.ts` L700-L704](https://github.com/mlc-ai/web-llm/blob/v0.2.89/src/conversation.ts#L700)). [PR #890](https://github.com/mlc-ai/web-llm/pull/890) "Replay null-content assistant tool calls" is **open, not merged**.
- `role: "tool"` is appended with its `content` only. `tool_call_id` is ignored, so results are matched to calls by position and wording only. Hermes' convention is to wrap each result in `<tool_response>` (see the [manual example](https://github.com/mlc-ai/web-llm/blob/v0.2.83/examples/function-calling/function-calling-manual/src/function_calling_manual.ts)).
- Only one system message is allowed, at index 0 (`SystemMessageOrderError`). On Hermes-2-Pro with `tools`, none is allowed.
- **Parallel calls:** the array format allows several calls per turn, and several consecutive `tool` messages are accepted. How reliably small models emit more than one is **UNVERIFIED**.
- A conv template without a `tool` role throws `Error("Role is not supported: tool")` ([wl@83 `conversation.ts` L312](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/conversation.ts#L312)). The Qwen3 and Qwen3.5 configs on HF `main` define only `user` and `assistant` roles, so for those models tool results have to go back as `user` messages. My understanding is that Qwen's own HF chat template also renders tool results inside a user turn wrapped in `<tool_response>`; this is **UNVERIFIED** (not read this session).

## 4. Reliability reports

- [#712 "tool calling issues"](https://github.com/mlc-ai/web-llm/issues/712) (open, 2025-07). A single user report, filed against commit `d8b25fe`. I diffed that commit's "7. Function calling hardcoded handlings" block in `chat_completion.ts` against v0.2.83: identical. The Hermes system prompt in `support.ts` is also the same. The report should therefore apply to 0.2.83, though nobody has reproduced it there. Only `Hermes-2-Pro-Mistral-7B` produced real calls. The other allowlisted models "always just output an empty array: `[]`", including in the official `function-calling-openai` example. The Mistral model in turn always calls a tool, even for "Hey" with `tool_choice: "none"`. A commenter falls back to prompting Llama-3.2-3B for JSON by hand.
- [#462](https://github.com/mlc-ai/web-llm/issues/462) (open): you cannot combine a system prompt with tools, and streaming the JSON as `content` is not OpenAI-compliant.
- [#526](https://github.com/mlc-ai/web-llm/issues/526) (open tracking issue): function calling is called **"beta"**. Native mixed prose-and-call output with grammar on `<tool_call>` (F3) and full OpenAI parity (F2) are still unchecked.
- [#795](https://github.com/mlc-ai/web-llm/pull/795) (**open PR**): content is nulled when tools are present, and reasoning models (Qwen3) break JSON parsing. It proposes `<tool_call>` extraction. Not shipped.
- [#843](https://github.com/mlc-ai/web-llm/issues/843) (closed): a `structural_tag` request hangs forever with a numeric unhandled rejection. It was filed on 0.2.84 with a **string-encoded** `json_schema`. The cause is the `new Promise(async …)` grammar-init pattern, which 0.2.83 has too ([wl@83 `llm_chat.ts` L786-L789](https://github.com/mlc-ai/web-llm/blob/v0.2.83/src/llm_chat.ts#L786)), so any grammar compile error on 0.2.83 becomes a hang rather than an error. Fixed by [#849](https://github.com/mlc-ai/web-llm/pull/849) in 0.2.85. Whether *valid* structural tags work on 0.2.83 is **UNVERIFIED**; the repo ships a [`structural-tag-tool-use` example](https://github.com/mlc-ai/web-llm/tree/v0.2.83/examples/structural-tag-tool-use) at v0.2.83, using `Llama-3.2-1B-Instruct`.
- [#876](https://github.com/mlc-ai/web-llm/pull/876) (in 0.2.87): Qwen3.5 records carry Qwen2 stop ids, so JSON-schema output gets cut off or loops on whitespace. In 0.2.83 this affects any constrained tool call on Qwen3.5.
- [#856](https://github.com/mlc-ai/web-llm/pull/856) (open PR): an MCP-client example. Not shipped.

## 5. Changes after 0.2.83 (latest is 0.2.89, 2026-11-17)

npm release dates: 0.2.84 on 2026-05-27, 0.2.85 on 09-08, 0.2.86 on 10-11, 0.2.87 on 10-30, 0.2.88 on 11-10, 0.2.89 on 11-17. There is no `v0.2.84` git tag; its source commit is [`9e572d6`](https://github.com/mlc-ai/web-llm/commit/9e572d6ed95e248f29634996cd32cc8f3023d89d).

| Version | Change relevant to tools |
|---|---|
| 0.2.84 | [#802](https://github.com/mlc-ai/web-llm/pull/802): Hermes-3 gets the same injected prompt and JSON-array grammar as Hermes-2-Pro (and therefore the same no-system-prompt restriction). |
| 0.2.85 | [#849](https://github.com/mlc-ai/web-llm/pull/849): grammar-init failures throw `GrammarMatcherInitError` instead of hanging. The docs now say nested `json_schema` must be an object, not a string. |
| 0.2.87 | [#876](https://github.com/mlc-ai/web-llm/pull/876): Qwen3.5 JSON-schema termination fix; whitespace between JSON elements capped at 16 characters. |
| 0.2.89 | Tokenization exposed through the engine and worker APIs. Useful for exact tool-budget counting. |

Unchanged through 0.2.89 in the files I diffed between `v0.2.83` and `v0.2.89` (`config.ts`, `support.ts`, `chat_completion.ts`, `engine.ts`, `conversation.ts`, `error.ts`): the allowlist, the forced JSON-array output, `tool_choice` being ignored, the missing streaming ids, and the string-only assistant replay. `llm_chat.ts` at v0.2.89 also has no `tool_choice` reference. The release notes do not mention any change to `tools` semantics.

The model-library (wasm) prefix moved several times: `v0_2_83/base` → `v0_2_84/base` (still used in 0.2.85) → `v0_2_86/base` → `v0_2_87`. Upgrading means fetching new wasm. Whether cached **weights** must also be re-downloaded is **UNVERIFIED**. That is a separate decision.

## 6. Recommendation for htllm

### (a) Keep Workspace HTTP-only. **Recommended now.**
On 0.2.83 the native path is limited to 7-8B models, a 4096 context, forced calls with no prose answer, no system prompt, and `tool_choice` ignored. One user report (#712, 2025-07) says most allowlisted models return `[]`. The manual path's failure mode on 0.2.83 is a silent hang. None of this can be tested live (htllm is in cleanup mode with no live-model tests), so shipping it would mean shipping untested behavior. The current gate at `useChat.ts` L585 (`'Tool use requires an HTTP model.'`) already says this honestly.

### (b) Workspace on specific WebLLM models through the native `tools` path. **Not recommended.**
If it were done anyway, the only candidates would be `Hermes-2-Pro-Llama-3-8B-q4f16_1` and `Hermes-2-Pro-Mistral-7B-q4f16_1` (plus `Hermes-3-Llama-3.1-8B-*` after upgrading to ≥ 0.2.84). Caveats: ≥ 4 GB VRAM; 4096 context unless raised; no htllm system prompt; and per #712, either `[]` every time or a tool call every time. The file-by-file work:
- `src/providers/webllm/index.ts`
  - Set `capabilities.toolCalls: true`.
  - Implement `detectToolSupport(id)` that returns an explicit `false` for ids outside `functionCallingModelIds`. Otherwise `resolveToolSupport` treats them as `assumed: true`.
  - Also refuse `tools` on non-allowlisted ids, because a user override could still enable them.
  - Pass `tools` and drop `toolChoice`.
  - Fold *all* system messages into the first user message (the Hermes path rejects any system message).
  - Replay assistant `toolCalls` as `content: JSON.stringify([{name, arguments}])`.
  - Map `role: 'tool'` to `{role: 'tool', content: '<tool_response>…</tool_response>'}`.
  - While `tools` is set, suppress `delta.content`, so raw JSON does not reach the UI.
  - Synthesize `id`s for the final-chunk `tool_calls`; `agent.ts` rejects empty ids.
  - Map `[]` to "no calls", then issue a **second request without `tools`** to get the prose answer. Otherwise `agent.ts` returns with no answer.
  - Turn a `length` finish into a clear error. The default `max_tokens` of 512 truncates `write_file` and `edit_file` arguments, and a truncated reply yields no calls.
- `src/providers/webllm/model-list.ts`: set `ModelInfo.toolCalls` from `functionCallingModelIds` (exported by web-llm).
- `src/hooks/useChat.ts` (~L585-L589): replace the HTTP-only throw with the per-model support check. Stop unshifting a second system message (web-llm allows one, at index 0); merge it into the existing one instead.
- `src/services/agent.ts`: no protocol change if the provider does the work above. Consider a lower `maxCalls` and a smaller result `maxChars` for in-browser models, given the 4096 context.
- `src/services/tools.ts` and the Workspace tool set: offer a reduced, read-only subset (`list_files`, `read_file`, `grep`) to fit the budget. Avoid offering MCP tools alongside.
- Tests: unit tests for the message mapping, id synthesis, `[]` handling and system-prompt folding, using a fake engine. No live tests.

### (c) Manual tool calling with `structural_tag`. **The better path if in-browser Workspace is ever wanted; needs web-llm ≥ 0.2.85 (≥ 0.2.87 for Qwen3.5).**
Don't pass `tools`. The provider:
- renders the tool schemas into htllm's own system prompt (one system message, so htllm's instructions survive);
- sends `response_format: {type: "structural_tag", structural_tag: {type: "triggered_tags", triggers: ["<tool_call>"], tags: [one tag per tool: begin '<tool_call>\n{"name": "<tool>", "arguments": ', content: {type: "json_schema", json_schema: <params object>}, end: '}\n</tool_call>'}], at_least_one: false}}`;
- streams prose normally;
- strips `<tool_call>` blocks out of `delta` and parses them into `ChatChunk.toolCalls`, with synthesized ids and `finishReason: 'tool_calls'`.

Per the [XGrammar docs](https://github.com/mlc-ai/xgrammar/blob/main/docs/structural_tag/structural_tag.md), `triggered_tags` "allows arbitrary text until a trigger is encountered", with `at_least_one` defaulting to `false`. So the model can answer in prose or call tools, and each tool's name and arguments are schema-constrained. That fixes the hallucinated-name and bad-argument problems of the native path. That this works in the web-xgrammar build bundled with 0.2.83 is **UNVERIFIED**.

- **Models:** start with `Qwen3-4B` / `Qwen3-8B` (3.4 / 5.7 GB; native context 40960 per HF config; they use a `<tool_call>` format natively, **UNVERIFIED**, from recall) and `Hermes-3-Llama-3.1-8B`. Qwen3.5 only on ≥ 0.2.87.
- **Replay:** send the assistant's raw `<tool_call>` text as `content`. Send results as `role: 'tool'` for Hermes templates, and as `role: 'user'` wrapping `<tool_response>` for Qwen templates (no `tool` role).
- **Version floors:** below 0.2.85 a bad schema hangs the request forever. That includes any MCP tool schema XGrammar cannot compile. Below 0.2.87 Qwen3.5 JSON is broken. So the floor is 0.2.85 for Qwen3 and Hermes, and 0.2.87 if Qwen3.5 is included. Pin the exact version.
- **htllm changes:** the same files as (b), except that the parsing lives in a new pure helper, e.g. `src/lib/tool-call-tags.ts`. It would build the structural tag from `ToolDefinition[]` and run an incremental `<tool_call>` stream parser, with unit tests. `model-list.ts` gets a hand-kept allowlist instead of `functionCallingModelIds`. Bumping `package.json` to an exact version also changes the model-lib wasm prefix (see section 5).
- **Context:** raise `context_window_size` to at least 8192 for Workspace. VRAM at that size is **UNVERIFIED**.

**Bottom line:** keep (a) for now. Revisit (c) as its own decision, together with the web-llm upgrade. Validate it with live runs before any UI exposes it.
