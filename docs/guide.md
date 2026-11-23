# Using htllm

See [compatibility](compatibility.md) for what has actually been tested.

## Model and chat

Run `pnpm install`, `pnpm dev`, and open `/app`. For production, run `pnpm build`
then serve `dist/` over HTTP(S); `pnpm preview` provides a local smoke-test server.
Choose an HTTP provider in the model picker, configure its base URL (including
`/v1`), and store a key through Settings if required. The endpoint must permit
the app's browser origin through CORS. Network, CORS, and certificate failures
may look identical to browser JavaScript.

HTTP chat and Knowledge do not need WebGPU. WebLLM does; model downloads and GPU
capability are separate from HTTP endpoint qualification. Without WebGPU, the chat
screen offers **use an HTTP model**, which opens the model picker on an HTTP tab.

## Documents and evidence

In Knowledge, create/select a library and pin an embedding provider/model. Add
TXT, Markdown, or text PDF files. PDF extraction reports page progress. Cancel
stops pending work; failed indexing does not commit a partial vector batch.
Successfully extracted text may remain unindexed so you can retry indexing.
Scanned/image-only, encrypted, and unreadable PDFs show explicit errors; no OCR
is performed. Review complex-layout PDF extraction before relying on its answers.

Select that library in **Tools → Documents → Knowledge library** and enable
**Automatic RAG** for one retrieval pass before answering. Expand **Sources supplied to this answer**, then a filename, to
inspect its saved excerpt and page/section. Saved evidence survives reload and
document deletion; a deleted original is labeled unavailable. Source cards show
evidence supplied to the model, not an independent verification of its answer.

Technical retrieval failure blocks generation. Retry after fixing the library,
or explicitly turn off Automatic RAG in Tools → Documents. No matching evidence is distinct from
failure. Related retrieved text does not guarantee the requested fact exists.
Normalized retrieval scores are not relevance probabilities.

## Chat and Workspace modes

Each new chat shows a **Chat mode** choice on its empty screen: **Chat** (the default)
or **Workspace**. The choice can change until you send the first message, then it is
locked. Each mode remembers the model you last used in it. Workspace chats carry a
small folder mark in the sidebar.

**Chat** has no tools. Its composer button reads **knowledge: off** or the library name
and opens *Knowledge for this chat*: the library selector and the **Automatic RAG**
switch (on by default when a library is attached), which searches the library once
before each answer. Selecting None turns retrieval off.

**Workspace** always uses tools. There is no on/off switch. Its composer button reads
**tools: on** and opens *Tools for this chat*. The Documents tab attaches a library
(read-only to the model) and lists the built-in tools. The External tools tab selects
connected MCP tools, and every external call still asks for approval. Workspace never
retrieves automatically: the model searches when it needs to.

Workspace needs an HTTP model that can call tools. The model picker shows a **tools /
no tools** badge per HTTP model, read from the server where it reports this (LM Studio,
Ollama, OpenRouter) or assumed otherwise (shown with `?`). Click the badge to override
it. A Workspace chat with a model marked "no tools" refuses to send and says why.
In-browser WebLLM models stay in Chat (see `docs/review/2026-11-23-research/webllm-tools.md`).

Chats that had Tools switched on before this release open as Workspace chats; all
others open as Chat. Citations use `[[Source <exact supplied source ID>]]` in both
retrieval and tool answers.

### Working with files in a Workspace

Each Workspace chat has its own folder of files:

- **/uploads**: files you attach with the paperclip in the composer. These are text,
  Markdown, CSV, JSON, code, or PDFs with a text layer, up to 25 MB each. They are
  read-only to the model. PDFs are stored as extracted text with page numbers.
  Attaching a file locks the chat's mode, like sending a message does. Attached files
  wait as chips and go with your next message: the model is told which files came
  with it. A small file (up to a quarter of the read size below) is included whole,
  ready to cite. Larger files are read with `read_file`.
- **/notes**: the model's own files. It creates, edits and copies into them. Every change
  is kept as a numbered version.
- **/library/&lt;name&gt;**: the attached Knowledge library, plus any extra libraries
  attached under **More libraries**. These are read-only.

The model works through tools: `list_files`, `read_file` (by line range, continuing
with `offset`), `search` (by meaning and keywords), `grep` (exact text or a simple
pattern), `write_file`, `edit_file`, `copy_file` and `present_file`. It also has
`calculate` for exact arithmetic, and, when the model's context is larger than 8k,
`query_csv` (when a CSV is attached) and `run_js`. `run_js` runs a short JavaScript program in
an isolated engine (QuickJS) inside a background worker. The script can read only the files it
lists and can print results. It has no network, no file writing, no access to the page, and
stops after 3 seconds. Lines longer than 400 characters are wrapped, so every part
of a long PDF page can be read by line number. Uploads and library files can be cited;
the model's notes cannot.

When the model hands you a file with `present_file`, it appears in the reply as a
card. Click the card to open it in the side panel, at the version it had then; step
through versions and download any of them. The **library** button in the viewer copies a file into a Knowledge
library, keeping PDF page numbers, so it can be searched by meaning in any chat. It is indexed right
away when the library has an embedding model. The **files** button (top right) lists the
chat's uploads and notes. Markdown is rendered, CSV shows as a table, JSON and code are
highlighted, and HTML and SVG are shown as code, never run.

Limits depend on the model's context window: up to 8k gives reads of 120 lines and 12
tool calls per answer; up to 32k gives 250 lines and 16 calls; larger gives 400 lines and
24 calls. When an answer stops at the limit, a **continue →** button sends a follow-up.
If the server reports the model's context (LM Studio, OpenRouter), thread parameters
offer it, and larger settings are capped to it.

If you regenerate or edit an earlier message, files changed by the removed replies stay
as they are; a notice lists them. Deleting a Workspace chat deletes its files, and the
confirmation says how many.

Tool activity is saved with its answer and replayed as history on later turns. Long
results older than the last two answers are shortened to a stub, and the model can
read the file again if needed. Stop aborts pending requests, and reload does not resume
an interrupted run.

## Compaction of long conversations

Compaction keeps the existing prompt, message-retention rules, reasoning-channel
fallback and stored-summary cap. Inputs that fit use the original single call.
Oversized input is divided into approximately half-context parts, summarized in
order, then aggregated with the same prompt. If the aggregate is too large it is
reduced in further parts. Only the final aggregate is saved. Requests retain the
existing uncapped output behavior and receive a 60-second timeout each; bounded
round/call limits prevent endless aggregation. Token sizing is approximate.

## MCP and approvals

In **Settings → Tools & connections**, enter a connection name, Streamable HTTP URL, and optional bearer token, then
**Test & add MCP**. HTTPS is supported; explicit localhost HTTP endpoints are
allowed. Select tools per conversation. **Refresh tools** rediscovers definitions,
invalidates that server's saved selections across chats, and clears session
trust. Other conversations must review changed definitions before using them.

Cross-origin MCP connections require server-side CORS configuration allowing
the app's origin, preflight requests and MCP headers, including for localhost
servers. A bearer token does not bypass CORS. The endpoint form shows the origin
to allow; browsers may report CORS and network failures similarly.

Every external call initially asks for approval showing server, tool, and JSON
arguments. Deny is the keyboard default; Escape denies. Only tools labeled
read-only can be explicitly trusted for the session. Server annotations are
untrusted hints—grant trust only after reviewing the service and tool. Writes
and unknown tools always require confirmation. Trust is not exported and is
invalidated by reload, disconnect, or detected definition changes.

After a timeout or ambiguous external failure, the outcome is **unknown** and
remaining tools stop. Check the external service before trying again; htllm
does not automatically repeat the action. Text and structured JSON are handled;
images, resource links, and other embedded content are not automatically fetched.

Docker MCP Gateway is a possible operator-managed bridge: its `streaming`
transport is distinct from its default stdio mode. Direct browser compatibility
still depends on origin/CORS policy and authentication. htllm does not launch it,
enable its servers, remove browser protections, or bundle a proxy. See Docker's
[gateway CLI](https://docs.docker.com/reference/cli/docker/mcp/gateway/run/) and
[security boundaries](https://github.com/docker/mcp-gateway/blob/main/docs/security.md).

## Storage, credentials, and backups

Data lives in this browser profile's IndexedDB. Browser quotas, private browsing,
site-data clearing, and profile deletion can remove it. Export backups regularly.
Keys are separate from exportable configuration but remain readable to code
running in this origin; this is not an encrypted credential vault. Use scoped,
short-lived tokens and do not share the browser profile on an untrusted machine.

Backups include threads, messages, summaries, citations, libraries, chunks, and
nonsecret MCP configuration. Embeddings are rebuildable and omitted; keys and
temporary trust are omitted. Restore validates before a transactional replacement,
clears existing keys to prevent reuse against imported endpoints, stops imported
runs, and reloads the app. Configure credentials again and rebuild embeddings.
Older exports lacking optional stores remain supported.
