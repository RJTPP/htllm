# Using the v1 implementation

This implementation is under qualification, not a released v1.
See [compatibility](v1-compatibility.md) for what has actually been tested.

## Model and chat

Run `pnpm install`, `pnpm dev`, and open `/app`. For production, run `pnpm build`
then serve `dist/` over HTTP(S); `pnpm preview` provides a local smoke-test server.
Choose an HTTP provider in the model picker, configure its base URL (including
`/v1`), and store a key through Settings if required. The endpoint must permit
the app's browser origin through CORS. Network, CORS, and certificate failures
may look identical to browser JavaScript.

HTTP chat and Knowledge do not need WebGPU. WebLLM does; model downloads and GPU
capability are separate from HTTP endpoint qualification.

## Documents and evidence

In Knowledge, create/select a library and pin an embedding provider/model. Add
TXT, Markdown, or text PDF files. PDF extraction reports page progress. Cancel
stops pending work; failed indexing does not commit a partial vector batch.
Successfully extracted text may remain unindexed so you can retry indexing.
Scanned/image-only, encrypted, and unreadable PDFs show explicit errors; no OCR
is performed. Review complex-layout PDF extraction before relying on its answers.

Select that library in the chat's Knowledge picker. Agent off performs one
retrieval pass. Expand **Sources supplied to this answer**, then a filename, to
inspect its saved excerpt and page/section. Saved evidence survives reload and
document deletion; a deleted original is labeled unavailable. Source cards show
evidence supplied to the model, not an independent verification of its answer.

Technical retrieval failure blocks generation. Retry after fixing the library,
or explicitly select Knowledge → None. No matching evidence is distinct from
failure. Related retrieved text does not guarantee the requested fact exists.
Normalized retrieval scores are not relevance probabilities.

## Agent mode

Open the **Tools: off/on** button beside Knowledge. Enable
**Use tools** in that panel. Tools on is Agent mode; there is no separate Agent
toggle. Tools off keeps ordinary chat and automatic RAG when a library is selected. This is a
per-thread setting applied on the next turn. No capability checkbox is required;
use an HTTP model that supports tool calling. WebLLM agents are unsupported.
Tools can stay on with Knowledge off: document tools return no evidence, while
selected external tools remain available.

`read_document` reads small files completely and returns a `nextCursor` for
larger files (up to 4,000 characters per read, reduced to fit the context budget).
Continue until `complete` is true; tool/context limits can leave a file partially
read. Page or section evidence accompanies each portion. Newly imported files
retain exact extracted text in browser storage and backups. Older imports expose
legacy chunks with `originalAvailable: false`; reimport them for exact whole-file
reading. For PDFs this covers extracted text, not images or OCR.

Built-in `list_documents`, `search_knowledge`, and `read_document` are restricted
to the selected library. They run without approval. The loop executes at most
eight calls sequentially, with a 60-second timeout per tool and the existing
estimated context budget. Stop aborts pending requests. Reload does not resume
an interrupted run. Tool activity is saved with its owning answer and included
as historical data during future budgeting/compaction, never as permission to act.

## MCP and approvals

In **Settings → Tools & connections**, enter a connection name, Streamable HTTP URL, and optional bearer token, then
**Test & add MCP**. HTTPS is supported; explicit localhost HTTP endpoints are
allowed. Select tools per conversation. **Refresh tools** rediscovers definitions,
invalidates that server's saved selections across chats, and clears session
trust. Other conversations must review changed definitions before using them.

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
