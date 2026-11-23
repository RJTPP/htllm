# Pi agent harness + pi-ai: research notes for a browser chat Workspace

Researched 2026-11-23. Read only. Source files were fetched raw at pinned tags and read; nothing was installed or run.

## Sources and versions

| Repo | Pinned ref | Notes |
|---|---|---|
| `earendil-works/pi` (formerly `badlogic/pi-mono`; GitHub redirects the old name) | tag **v1.6.0** (released 2026-11-20). main HEAD at the time was `69a6993486acee850d14a4a1547daa4a167228ad` but **all links below use the tag** | Packages: `@earendil-works/pi-coding-agent` 1.6.0, `@earendil-works/pi-ai` 1.6.0, `@earendil-works/pi-agent-core` 1.6.0. Older npm scope: `@mariozechner/*`. Author confirmed in source: `LICENSE` says "Copyright (c) 2025 Mario Zechner", and each `package.json` has `"author": "Mario Zechner"` ([coding-agent/package.json](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/package.json)) |
| `ollama/ollama` | **v0.40.17** (2026-11-10) | |
| `ggml-org/llama.cpp` | **b12633** (2026-11-22) | |
| `vllm-project/vllm` | **v0.34.0** (2026-11-16) | |
| LM Studio | closed source. Docs fetched today with no version pin; the API changelog's latest entry is **0.4.1** | lmstudio.ai/docs pages |

Link prefix used below: `P = https://github.com/earendil-works/pi/blob/v1.6.0/`

---

# Part 1: Pi, the agent harness (`packages/coding-agent`)

## 1.1 Philosophy and system prompt

**Stated philosophy.** The README says: "Pi is a minimal, extensible agent harness that you can make your own." It also says Pi "skips features like sub-agents and plan mode" and that users should ask Pi to build those or install a package ([P/packages/coding-agent/README.md](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/README.md) L15–19). Extensions, skills, prompt templates and packages are how you customize it. Any further rationale from the author's blog posts (for example, few tools because frontier models are already trained on coding-agent tool use) was not read: **UNVERIFIED**.

**Default tool set.** The setting `defaultTools` defaults to `read`, `bash`, `edit`, `write` ([P/packages/coding-agent/docs/settings.md](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/settings.md#L42)). Other built-ins exist but are off by default: `grep`, `find`, `ls`, `powershell`. So are the extension tools `codemode` and `tool_search` (same file, L46).

**System prompt construction.** See [P/packages/coding-agent/src/core/system-prompt.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/system-prompt.ts).
- The preamble is a single sentence (L156): *"You are a coding assistant running inside pi, a coding agent harness. Help users inspect files, run commands, and modify code."*
- After it come XML-tagged **sections**, each one independently replaceable: `<tools>`, `<rules>`, `<docs>`, then optionally `<addendum>`, `<project_context>` (AGENTS.md-style files as `<project_instructions path=…>`), `<skills>`, and finally `<cwd>`.
- `<tools>` holds one line per tool, taken from that tool's `promptSnippet` (for example `- read: Read file contents`), followed by "Additional tools may be available." (L160).
- `<rules>` is the deduplicated set of per-tool `promptGuidelines` plus two fixed rules: "Be concise in your responses" and "Show file paths clearly when working with files" (L122–123).
- A tool's bullets appear in `<rules>` only while that tool is active. The extension docs warn that bullets are appended flat, so each guideline must name its tool ("avoid 'Use this tool when...'") ([P/.../docs/extensions.md L1592](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/extensions.md#L1592)).
- **Prompt diffs.** When an extension changes a section, Pi diffs the old and new sections (`diffSystemPromptSections`) and appends a *system message that patches only the changed sections*. Models that accept mid-conversation system messages keep their cached prefix. Other models get the replayed prompt collapsed into the leading system message ([P/packages/ai/README.md "System Messages"](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/README.md#L1621)).

**Size, reconstructed and estimated.** These numbers come from assembling the default prompt from source with the four default tools. They are not a captured request.
- Preamble + `<tools>` + `<rules>`: about 1,000 characters, roughly **250 tokens**.
- `<docs>` (paths to Pi's own docs) + `<cwd>`: about 1,250 characters, roughly 310 tokens.
- Total prompt text: about **560 tokens**, or about 250 without `<docs>`.
- The four tool definitions: a regex count of their description strings in source gives about 1.9K characters. With JSON-schema scaffolding the total is roughly 2.4–2.9K characters, about **600–730 tokens**. This is a rough guess, not a serialized request.
- End to end, a default request is about **1.2–1.3K tokens** before project context and skills.
- Method: characters ÷ 4. Not tokenizer-measured.

## 1.2 Tools: exact schemas and behaviour

All four default tools use TypeBox schemas and set `constrainedSampling: { type: "json_schema", strict: "prefer" }`. Verified in read.ts L244, bash.ts L288, edit.ts L151 and write.ts L56; not checked for grep, find or ls. This asks for strict server-side schema enforcement where the provider supports it and falls back silently where it does not.

### read ([P/.../tools/read.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/read.ts))
- **Schema** (L14–18):
  - `path: string` ("relative or absolute")
  - `offset?: number` ("Line number to start reading from (1-indexed)")
  - `limit?: number` ("Maximum number of lines to read")
- **Defaults:** `offset` defaults to line 1. **`limit` has no default.** The only cap is the global truncation of **2000 lines or 50 KB, whichever is hit first** ([truncate.ts L11–12](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/truncate.ts#L11)).
- **No line-number prefixes.** Output is the raw text (`truncation.content`). The model learns line numbers only from the trailing notice.
- **Description** (L239): "…output is truncated to 2000 lines or 50KB… Use offset/limit for large files. When you need the full file, continue with offset until complete."
- **Continuation hints**, appended after a blank line (L321–338):
  - `[Showing lines 1-2000 of 5312. Use offset=2001 to continue.]`
  - `[Showing lines X-Y of N (50KB limit). Use offset=… to continue.]`
  - With a user-supplied `limit` and more content remaining: `[N more lines in file. Use offset=… to continue.]`
  - When the first line alone is over 50 KB: `[Line N is 1.2MB, exceeds 50KB limit. Use bash: sed -n 'Np' path | head -c 51200]`
  - Offset past the end throws `Offset X is beyond end of file (N lines total)`.
- **Images** (jpg/png/gif/webp/bmp), detected by MIME:
  - Pi auto-resizes the image to the model's `inputLimits` and returns `[text "Read image file [image/png]" + resize hints, image block]`.
  - If the model has no image input, pi-ai later replaces the image with `(tool image omitted: model does not support images)` ([transform-messages.ts L12–13, L60–83](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/transform-messages.ts#L12)).
  - Because of that, the stored result stays correct after a model switch.

### write ([P/.../tools/write.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/write.ts))
- **Schema:** `{path, content}`.
- **Description:** "Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories."
- **Guideline:** "Use write only for new files or complete rewrites."
- **Result text:** `Successfully wrote to ${path}`.

### edit ([P/.../tools/edit.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/edit.ts), [edit-diff.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/edit-diff.ts))
- **Schema** (L18–37): `{ path, edits: [{ oldText, newText }] }`. This is a multi-edit array; every edit is matched against the **original** file, not applied incrementally.
- **Matching** (`fuzzyFindText`, edit-diff L250):
  1. Try an exact substring match.
  2. If that fails, try a match in a fuzzy-normalized space (`normalizeForFuzzyMatch`, L77): NFKC, trailing whitespace stripped per line, smart quotes → ASCII, Unicode dashes → `-`, exotic spaces → space.
  3. If any edit needed the fuzzy match, replacements are widened to whole lines and overlaid onto the original. Untouched lines keep their bytes, CRLF line endings are preserved, and a BOM is stripped and restored.
- **Uniqueness:** occurrences are counted in the fuzzy-normalized space (L290). More than one occurrence is an error. Overlapping edits are also an error.
- **Error messages the model sees** (L296–331, L389):
  - Not found: `Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.` With multiple edits: `Could not find edits[i] in ${path}. The oldText must match exactly…`
  - Duplicate: `Found ${n} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`
  - Empty: `oldText must not be empty in ${path}.`
  - Overlap: `edits[i] and edits[j] overlap in ${path}. Merge them into one edit or target disjoint regions.`
  - No-op: `No changes made to ${path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`
- **Result:** `Successfully replaced ${n} block(s) in ${path}.` A diff goes into `details`. That `details` is never sent to the model is an inference from how `content` and `details` are split: **UNVERIFIED**.
- **Argument repair for sloppy models** (`prepareEditArguments`, L98–133):
  - Accepts `edits` sent as a JSON *string*. The source comment names "Opus 4.6, GLM-5.1".
  - Accepts a single `{oldText,newText}` object in place of an array.
  - Accepts legacy top-level `oldText`/`newText`.
- **Concurrency:** edit and write call `withFileMutationQueue(absolutePath, …)`. That suggests a queue per path that serializes parallel calls on the same file, but `file-mutation-queue.ts` was not read.

### bash ([P/.../tools/bash.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/bash.ts))
- **Schema:** `{command, timeout?}`. There is no default timeout.
- **Truncation** uses `truncateTail`, keeping the **last** 2000 lines or 50 KB. The full output is saved to a temp file.
- **Notice:** `[Showing lines X-Y of N. Full output: /tmp/…]`.
- On timeout: `Command timed out after N seconds`.

### grep / find / ls (off by default)
- **grep:** `{pattern, path?, glob?, ignoreCase?, literal?, context?, limit?=100}`. Lines are cut at 500 characters. The notice is `[100 matches limit reached. Use limit=200 for more, or refine pattern. Some lines truncated to 500 chars. Use read tool to see full lines]` ([grep.ts L20–45, L299–313](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/grep.ts#L20)).
- **find:** `{pattern (glob), path?, limit?=1000}`.
- **ls:** `{path?, limit?=500}`, sorted alphabetically, with `/` suffix on directories and dotfiles included ([ls.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/ls.ts)).
- The same pattern holds across all three: each limit notice tells the model the exact next parameter value to use (`limit=…*2`, `offset=…`).

## 1.3 Tool-output truncation: what the model sees
- One shared constant pair: **2000 lines / 50 KB**. `read` keeps the head; `bash` keeps the tail ([truncate.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/tools/truncate.ts)).
- Every truncation ends with a bracketed, **actionable** notice: the range shown, the total, and the exact next argument.
- Tool errors become a tool result with `isError: true` and the error message as plain text. Examples: `Tool X not found`, or validation failures listing `path: message` lines followed by the received arguments ([agent-loop.ts L729, L915](https://github.com/earendil-works/pi/blob/v1.6.0/packages/agent/src/agent-loop.ts#L915); [validation.ts L54–75](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/utils/validation.ts#L54)).

## 1.4 Context management
- **Auto-compaction** triggers when `contextTokens > contextWindow - reserveTokens`, where `reserveTokens` defaults to **16384**. It keeps the most recent **20k tokens** (`keepRecentTokens`) verbatim and summarizes the rest ([P/.../docs/compaction.md L32–45](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/compaction.md#L32)).
  - Cuts happen at user or assistant messages, never at a tool result.
  - Repeated compactions update the previous summary iteratively.
  - On a provider overflow error, or `stopReason: "length"` arriving early, Pi compacts and retries once.
  - Overflow is detected with per-provider regexes, including llama.cpp's "the request exceeds the available context size" and LM Studio's "tokens to keep from the initial prompt is greater than the context length" ([P/packages/ai/src/utils/overflow.ts L1–30](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/utils/overflow.ts)).
- **Summary format** (L234+): structured markdown with Goal / Constraints & Preferences / Progress (Done / In Progress / Blocked) / Key Decisions / Next Steps / Critical Context, then `<read-files>` and `<modified-files>` lists that **accumulate across compactions**.
- **Serializer for the summarizer** (L289–291):
  - The conversation is flattened to `[User]: … / [Assistant]: … / [Assistant tool calls]: read(path="…") / [Tool result]: …`, which stops the summarizer from continuing the chat.
  - **Thinking blocks are omitted.**
  - **Tool results are truncated to 2000 characters.**
- **Pruning old tool results.** I found no automatic pruning of old tool results in `compaction.md`, `settings.md`, `compaction.ts` or `agent-session.ts`; I grepped for "prun". The mechanism Pi has is an append-only **`context_edit`** entry ([session-format.md L139–147](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/session-format.md#L139)).
  - `replacement: null` omits a target user, assistant or tool-result entry from future model context.
  - A string replacement swaps the entry's content.
  - The raw history stays intact for UI and export.
  - Pi uses it to omit failed or overflowed attempts. Whether extensions can append these entries for pruning was not checked: **UNVERIFIED**.
- **Session format, one line:** JSONL tree (`id`/`parentId`, v3). Branches live in one file. Compaction and branch summaries are entries, and the model context is rebuilt from the active branch ([session-format.md](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/session-format.md)).

## 1.5 Extension model (brief)
- Extensions are TypeScript modules loaded in-process.
- They register tools, each with `promptSnippet` and `promptGuidelines`. Those contributions appear only while the tool is active.
- They can also register commands, providers and event handlers such as `before_agent_start` (which can edit `systemPromptOptions.sections` / `selectedTools`), `session_before_compact` (custom summaries), and tool events ([extensions.md](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/extensions.md)).
- **Skills** follow the Agent Skills spec. Only name and description sit in the prompt, and the full `SKILL.md` is read on demand ("progressive disclosure") ([skills.md](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/skills.md)).
- Built-in **`tool_search`** (BM25 over tool descriptions) and **`codemode`** can hide large tool sets behind one tool. `codemode.inlineBudget` defaults to 3000 estimated tokens ([settings.md L43–46](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/settings.md#L43)).

## 1.6 Things aimed at weaker or local models
- **Argument coercion before validation:**
  - `validateToolArguments` coerces with pi-schema, turning `"42"` into a number, a single value into an array, and `null` into an omitted optional.
  - Errors are reported as dotted paths plus the received JSON, so the model can self-correct ([validation.ts L45–75](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/utils/validation.ts#L45)).
  - Malformed JSON: `json-parse.ts` exports `repairJson` and `parseToolCallArguments`. When the arguments are not a valid JSON object, `ToolCall.argumentsError` is set and validation fails with that message ([types.ts L452–465](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/types.ts#L452), [validation.ts L55–57](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/utils/validation.ts#L55)). That repair is tried before `argumentsError` is set was not read in the function body: **UNVERIFIED**.
- **Edit robustness:** fuzzy Unicode and whitespace matching, plus shape repair for `edits` (above).
- **Strict sampling with fallback:** `strict: "prefer"` on every built-in tool. On OpenAI-compatible endpoints `strict` is only sent when the model's `compat.supportsStrictMode` is set; the default is **false**, because "OpenAI compatibility alone does not imply strict JSON-schema tool support" ([openai-completions.ts L1678–1680, L1500–1508](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/openai-completions.ts#L1500)).
- **First-class local llama.cpp integration:** a router-mode `/llama` command, and llama.cpp chat models used as **classifiers** through next-token label probabilities ([docs/llama-cpp.md](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/llama-cpp.md)). Ollama, LM Studio and vLLM are configured as `openai-completions` endpoints in `models.json` ([docs/models.md L37–60](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/models.md#L37)).
- **Defaults for unknown models:** `contextWindow` defaults to 128000 and `maxTokens` to 16384 ([models-configuration.md L26–58](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/models-configuration.md#L26)).
- I found no prompt variant specifically for small models: **UNVERIFIED** that none exists, since I did not read every extension.

---

# Part 2: pi-ai (`@earendil-works/pi-ai`) and modern tool calling

## 2.1 Normalized tool calling
- **One event stream for every API:** `start`, `text_start|delta|end`, `thinking_start|delta|end`, `toolcall_start|delta|end`, then `done` (reason `stop|length|toolUse|deferred`) or `error` (reason `error|aborted`). Each event carries `contentIndex` and the growing `partial` AssistantMessage ([types.ts L831–862](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/types.ts#L831)).
- **Message model:**
  - An assistant message is an ordered list of `text | thinking | toolCall` blocks.
  - A `toolCall` is `{id, name, arguments: object, thoughtSignature?, argumentsError?}`.
  - Tool results are their own role (`toolResult`) with `toolCallId`, `toolName` and `isError`.
- **Streaming partial JSON:**
  - `ToolCallArgumentsStream` / `StreamingJsonParser` reads each delta **once**, linear in input. It is a tolerant incremental parser.
  - Unterminated strings show their partial text, and members without a value are omitted.
  - `arguments` is always at least `{}` ([streaming-json.ts L1–35, L452](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/utils/streaming-json.ts)).
  - The changelog records the bug this replaced, quadratic re-parsing: "a 90 KB `write` on Anthropic peaked at about 140 MB of heap" ([ai CHANGELOG L137](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/CHANGELOG.md)).
- **Chat Completions accumulation** ([openai-completions.ts L487–540, L641–670](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/openai-completions.ts#L487)):
  - Tool-call deltas are keyed by **`index` first, then `id`**.
  - The name is filled in when it first arrives.
  - Arguments are appended to that block's stream.
  - This should also handle servers that send each call whole in one chunk, such as Ollama. That is an inference: how Ollama assigns `Function.Index` across chunks was not checked (**UNVERIFIED**).
- **The other APIs map onto the same `toolcall_*` events:**
  - **Anthropic:** `input_json_delta.partial_json` is appended to the same arguments stream ([anthropic-messages.ts L1042–1048](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/anthropic-messages.ts#L1042)).
  - **OpenAI Responses:** `response.function_call_arguments.delta` / `.done` ([openai-responses-shared.ts L726–731](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/openai-responses-shared.ts#L726)).
  - **Google:** "does not support function call streaming". The client gets a single `toolcall_delta` with the full arguments ([README L652–694](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/README.md#L652)).
- **Missing `finish_reason`:** if the endpoint lacks it (`compat.supportsFinishReason: false`), the stop reason is inferred as `toolUse` when any tool call exists (L684–692).
- **Parallel calls:** an assistant message can hold several `toolCall` blocks. The agent loop executes them **in parallel by default** (`toolExecution` default `"parallel"`). Any tool marked `executionMode: "sequential"` forces the whole batch to run sequentially ([agent-loop.ts L518–533](https://github.com/earendil-works/pi/blob/v1.6.0/packages/agent/src/agent-loop.ts#L518); [agent types.ts L315](https://github.com/earendil-works/pi/blob/v1.6.0/packages/agent/src/types.ts#L315)).
- **Transcript repair before every request** ([transform-messages.ts L91–259](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/transform-messages.ts#L91)):
  - **Orphaned tool calls** (no result before the next assistant or user message, or at the end) get a synthetic `toolResult` "No result provided", `isError: true`.
  - **Errored or aborted assistant messages are skipped entirely** on replay. They "may have partial content (reasoning without message, incomplete tool calls)". Note: the README's "Continuing After Abort" example ([README L1210](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/README.md#L1210)) contradicts this; the source says they are dropped.
  - **Tool-call IDs** are re-mapped when crossing providers. Responses IDs are "450+ chars with … `|`", while Anthropic requires `^[a-zA-Z0-9_-]+$`, max 64 characters.
  - A system message landing between a call and its result is held until after the results.
- **Wire-format details for Chat Completions** ([openai-completions.ts L1290–1400](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/openai-completions.ts#L1290)):
  - Assistant `content` is always a **plain string**, never parts. Sending parts made "DeepSeek V3.2 via NVIDIA NIM … mirror the content-block structure literally".
  - Empty assistant messages with no tool calls are skipped.
  - Tool-call `arguments` are re-serialized with `JSON.stringify`.

## 2.2 Reasoning / thinking
- **Storage:** `ThinkingContent {thinking, thinkingSignature?, redacted?}`. The signature slot holds provider replay data: an Anthropic signature, a Responses encrypted item, OpenRouter `reasoning_details`, or, for OpenAI-compatible endpoints, **the name of the field the reasoning arrived in** ([types.ts L436–445](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/types.ts#L436)).
- **Streaming on OpenAI-compatible endpoints** (L575–611):
  - Pi checks `reasoning_content`, `reasoning` and `reasoning_text` in that order and uses the **first non-empty** one, which avoids double-counting providers that send both.
  - That field name is remembered as the block's `thinkingSignature`.
  - Reasoning is handled before content in the same delta.
- **Replay on OpenAI-compatible endpoints** (L1305–1387):
  - Same model: reasoning goes back **in the same field it came in** (`assistantMsg[signature] = thinking`). The comment says "for llama.cpp server + gpt-oss".
  - `requiresThinkingAsText` turns reasoning into plain text with no tags "to avoid model mimicking them". The models-configuration doc says `<thinking>` delimiters, but the source has none, so trust the source.
  - `requiresReasoningContentOnAssistantMessages`, auto-detected for DeepSeek, injects `reasoning_content: ""` on **every** replayed assistant message.
- **Cross-model handoff:** the rule is to **keep reasoning only when provider, api and model all match**. Otherwise:
  - drop thinking blocks entirely, signed or not;
  - strip Gemini `thoughtSignature` from tool calls;
  - re-map tool-call IDs.
  - The stated reason: "Signatures and encrypted reasoning are only valid for the model that produced them, and sending readable thinking as plain text makes the new model treat it as part of the visible reply" ([transform-messages.ts L129–131](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/transform-messages.ts#L129); [README "Cross-Provider Handoffs" L1579](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/README.md#L1579)).
- **Providers that require reasoning to be returned, and what broke without it.** All of the following come from Pi's changelog and adapter comments; I did not read provider docs.
  - **DeepSeek V4** (direct and via OpenRouter): session replay failed with **400** until empty `reasoning_content` was injected on all assistant messages ([ai CHANGELOG L1413, L1429](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/CHANGELOG.md)).
  - **Anthropic / Bedrock Claude:** thinking blocks must be replayed with their `signature`. Unsigned ones, for example from an aborted stream, are converted to text. Redacted ones go back as `redacted_thinking` ([anthropic-messages.ts L1707–1740](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/anthropic-messages.ts#L1707)). Stale signed blocks after a system-prompt or tool change caused **400 "Invalid `signature` in `thinking` block"**; newer models now drop them (CHANGELOG L76, L311).
  - **Gemini 3:** `thoughtSignature` must be replayed on the same part (including `functionCall` parts), must be valid base64, and must come from the same model ([google-shared.ts L115–162](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/google-shared.ts#L115)). Unsigned tool-call replay needed workarounds (CHANGELOG L1368, L1761, L2120).
  - **OpenAI Responses:** Pi requests `include: ["reasoning.encrypted_content"]` and replays the encrypted items ([openai-responses.ts L409](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/api/openai-responses.ts#L409)).
  - **Xiaomi MiMo and Kimi via OpenCode Go:** need `reasoning_content` on assistant tool-call messages (CHANGELOG L1237, L1247).
  - Exact provider error text beyond what is quoted above: **UNVERIFIED**.
- **Thinking level:** a unified `reasoning: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'` input. `xhigh` and `max` are model-specific and opt-in ([README L1007–1044](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/README.md#L1007)). It is mapped per provider through `compat.thinkingFormat`:
  - `openai` → `reasoning_effort`
  - `qwen` → `enable_thinking`
  - `chat-template` → `chat_template_kwargs`
  - `deepseek`, `zai`, `openrouter`, …
  - An optional token-budget field: vLLM `thinking_token_budget`, llama.cpp `thinking_budget_tokens`. These field names come from Pi's docs, not from the servers' own docs ([models-configuration.md L105–143](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/models-configuration.md#L105)).

## 2.3 Per-model capability metadata
- **`Model` fields:** `{id, name, api, provider, baseUrl, input: ("text"|"image")[], inputLimits?, cost{input,output,cacheRead,cacheWrite,tiers?}, reasoning: boolean, thinkingLevelMap?, contextWindow, maxTokens, samplingParams?, compat?}` ([types.ts L864–913](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/types.ts#L864)).
- **There is no `tools` flag.** Tool capability is a *catalog filter*: "`modelsDevModels()` keeps tool-capable chat models" ([catalog/README.md L43](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/catalog/README.md#L43)).
- **Where the data comes from:** the catalog is generated from **models.dev v2**, plus OpenRouter, Vercel AI Gateway, NVIDIA NIM and Radius fetchers, with per-provider corrections and family rules.
  - pi.dev **serves updated catalogs to released clients within hours**, without a client update (same file).
  - That is remote-fetched data, which does not fit htllm's rules.
- **Two layers of compat:** `compat` holds per-endpoint quirks that are auto-detected from `baseUrl` (`detectCompat`, L1640–1690) and then overridden field by field from `models.json`.

## 2.4 Abort, usage/cost, errors (brief)
- **Errors never throw after the stream starts.** The stream emits `error` with the partial message, and `stopReason` is `"error"` or `"aborted"` with `errorMessage` ([README L1150–1209](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/README.md#L1150)).
- **Abort:** through `AbortSignal`. Partial content and usage are kept.
- **Context overflow** is classified with regexes (`overflow.ts`) so the caller can compact and retry.
- **`Usage`:** `{input, output, cacheRead, cacheWrite, reasoning?, totalTokens, cost{…, total, totalFromProvider?}}`. Cost is catalog-derived unless the provider reports a billed cost. `stream_options.include_usage` is sent unless `supportsUsageInStreaming: false` ([types.ts L467–495](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/types.ts#L467); openai-completions L826).
- **Browser use is supported**, with explicit API keys or an injected `CredentialStore`. OAuth flows and Bedrock are Node-only ([README L1689](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/README.md#L1689)).
- pi-ai also has optional **telemetry spans** through a passed-in span; the default is a no-op.

## 2.5 OpenAI-compatible local servers, late 2026

| | Ollama v0.40.17 | LM Studio (docs, unpinned; changelog ≤0.4.1) | llama.cpp server b12633 | vLLM v0.34.0 |
|---|---|---|---|---|
| `tools` | Yes | Yes: native (template) or "default" prompt-based fallback | Yes, **requires `--jinja`** (now default on) | Yes, needs `--enable-auto-tool-choice` + `--tool-call-parser` |
| Streamed tool-call deltas | **Whole calls per chunk.** `ToToolCalls` marshals complete arguments, with an `index` | **Incremental**: "Tool-call argument tokens are streamed as they are generated" (0.3.17) | **Incremental** diffs: `index`, `id` on first, `function.arguments` fragments | Parser-dependent. The `hf` response-template parser emits "each tool call … whole once its region parses"; others stream through `extract_tool_calls_streaming` |
| Parallel calls | Yes (docs "Parallel tool calling") | Streaming fixes in 0.3.18/0.3.19; `parallel_tool_calls` param **UNVERIFIED** | `parallel_tool_calls` param. **Docs say off by default; source defaults to the template's capability** | Yes. `parallel_tool_calls=false` honored by some parsers |
| `tool_choice` | **Not supported** (unchecked in docs) | `none`/`auto`/`required` ("required" llama.cpp engine only), 0.3.15 | `auto`/`required`/`none` as strings. Object (named) form **UNVERIFIED** | `auto`, `required`, `none`, and named function. Required and named use structured outputs |
| Strict JSON schema | No `strict` field in `openai.go`. Behaviour **UNVERIFIED** | Not documented for tools (**UNVERIFIED**) | No `strict` handling found in `chat.cpp`, `server-common.cpp` or `server-chat.cpp` (only the Responses→chat conversion defaults it). Tool calls use a lazy grammar (`grammar_lazy`); that it pins arguments to the schema is inference (**UNVERIFIED**) | **Yes**: per-tool `strict: true` pins the argument schema. `--tool-strict-level auto/function/parameter`; env `VLLM_ENFORCE_STRICT_TOOL_CALLING` |
| Reasoning field (out) | `reasoning` (message and delta). A mixed chunk is split into a reasoning chunk, then a content/tool chunk | `reasoning` for gpt-oss since 0.3.23 (`choices.delta.reasoning`). 0.3.9 added "reasoning content in a separate field" for DeepSeek R1; the field name `reasoning_content` comes only from a third-party write-up (**UNVERIFIED**) | `reasoning_content` (`--reasoning-format`, default auto) | **`reasoning`**. "`reasoning` used to be called `reasoning_content`" |
| Reasoning in (replay) | Accepts `reasoning` on assistant messages → `Thinking` | **UNVERIFIED** | "Reasoning input … supported by some specific templates" (PR#18994) | Accepts `reasoning` on assistant messages (interleaved-thinking example) |
| Reasoning control | `reasoning_effort` / `reasoning.effort` | `reasoning.effort` (gpt-oss) | `reasoning_effort` (`none` disables), `chat_template_kwargs`, `--reasoning-budget`, `/v1/chat/completions/control` `reasoning_end` | `reasoning_effort`, `thinking_token_budget` |

**Citations for the table:**
- Ollama:
  - [docs/api/openai-compatibility.mdx L215–253](https://github.com/ollama/ollama/blob/v0.40.17/docs/api/openai-compatibility.mdx#L215) (`tools` ✓, `reasoning_effort` ✓, `tool_choice` ✗)
  - [openai/openai.go L36–48, L303–320, L400–418, L642](https://github.com/ollama/ollama/blob/v0.40.17/openai/openai.go#L303)
  - [docs/capabilities/tool-calling.mdx L175, L586–588](https://github.com/ollama/ollama/blob/v0.40.17/docs/capabilities/tool-calling.mdx#L586) ("gather every chunk of `thinking`, `content`, and `tool_calls`, then return those fields together")
- LM Studio:
  - [developer/openai-compat/tools](https://lmstudio.ai/docs/developer/openai-compat/tools)
  - [developer/api-changelog](https://lmstudio.ai/docs/developer/api-changelog) (0.3.9, 0.3.15, 0.3.17, 0.3.18, 0.3.19, 0.3.23, 0.3.29 `/v1/responses`, 0.4.1 `/v1/messages`)
- llama.cpp:
  - [tools/server/README.md L239–243, L1466–1476, L1538, L1588–1590](https://github.com/ggml-org/llama.cpp/blob/b12633/tools/server/README.md#L1466)
  - [docs/function-calling.md L1–25](https://github.com/ggml-org/llama.cpp/blob/b12633/docs/function-calling.md)
  - [tools/server/server-common.cpp L1500–1508, L1591](https://github.com/ggml-org/llama.cpp/blob/b12633/tools/server/server-common.cpp#L1500)
  - [tools/server/server-chat.cpp L23, L689–712](https://github.com/ggml-org/llama.cpp/blob/b12633/tools/server/server-chat.cpp#L689)
  - [common/chat.h L235–272](https://github.com/ggml-org/llama.cpp/blob/b12633/common/chat.h#L235)
- vLLM:
  - [docs/features/tool_calling.md L3, L76–159, L165–206](https://github.com/vllm-project/vllm/blob/v0.34.0/docs/features/tool_calling.md)
  - [docs/features/reasoning_outputs.md L5–9, L93, L176](https://github.com/vllm-project/vllm/blob/v0.34.0/docs/features/reasoning_outputs.md)
  - [docs/features/interleaved_thinking.md](https://github.com/vllm-project/vllm/blob/v0.34.0/docs/features/interleaved_thinking.md) (example appends `"reasoning": message.reasoning`)

**Practical implications for a browser client:**
- Read reasoning from `reasoning_content`, `reasoning` or `reasoning_text`, using the first non-empty one.
- Accumulate tool calls by `index`, falling back to `id`.
- Accept both whole-call chunks and fragments.
- Don't depend on `tool_choice` (Ollama documents it as unsupported) or `strict` (of these four, only vLLM documents per-tool enforcement; LM Studio's behaviour is unknown).
- Treat a missing `finish_reason` as `tool_calls` when calls are present.

---

## Borrow for a browser chat workspace

These are patterns to copy, not a dependency to add. pi-ai's catalog is refreshed remotely from pi.dev and it has telemetry hooks, which conflicts with htllm's rules unless vetted. Items are ranked within each group.

### (a) Tool and prompt design
1. **End every truncated tool result with the exact next argument** (`[Showing lines 1-400 of 1210. Use offset=401 to continue.]`), because weak models page correctly when handed it.
2. **Keep about five file-shaped tools: list, read{path,offset,limit}, search{pattern,limit}, write{path,content}, edit{path,edits[{oldText,newText}]} matched against the original**, because Pi shows four suffice and this avoids incremental-offset bugs.
3. **Copy Pi's edit semantics and error strings verbatim** (exact match, then normalized match; must be unique; "Found N occurrences… provide more context"), because they are tuned self-correction prompts.
4. **Coerce, then validate arguments, and return failures as `isError` results with `path: message` and the received JSON**, because malformed arguments are where small local models fail most.
5. **Build the system prompt from tagged sections, with one-line tool snippets and rules that name their tool and appear only while the tool is active**, because Chat vs Workspace then becomes a section/tool swap on a base prompt of about 250 tokens.

### (b) Provider/API layer
6. **Store reasoning with the field it arrived in, replay it only to the same model in that field, inject empty `reasoning_content` where flagged, and drop it on a model switch**, because Pi's changelog records 400s on DeepSeek and Claude, and thinking leaks into the visible reply on handoff.
7. **Run a transcript-repair pass before each request (synthetic `isError` results for orphaned calls, drop errored or aborted turns, image placeholders for non-vision models, string content)**, because htllm's 60s tool timeout and user aborts create exactly these cases.
8. **Accumulate tool-call deltas by `index`, falling back to `id`, with a tolerant incremental JSON parser, behind a per-endpoint `compat` object defaulting to no `strict` and no `tool_choice`**, because that one structure covers fragment streams (LM Studio, llama.cpp) and probably Ollama's whole-call chunks (index handling unverified).
