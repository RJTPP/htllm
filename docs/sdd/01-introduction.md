## 1. Introduction

This document describes how htllm 1.0.0 is built and why. It is written for people who
change the code, review it, or host it. Where the code and this document disagree, the
code wins and this document has a bug.

### 1.1 Purpose

The SDD exists to:

1. Give a contributor the system's boundaries, layers and invariants before they change
   code, so that the hard constraints (no backend of our own, provider abstraction, worker isolation,
   CSP) hold.
2. Record the product decisions behind Chat and Workspace modes (D-1 to D-31) and the
   architectural decisions (AD-1 onward), with reasons and rejected alternatives, so they
   are not reopened without cause.
3. Give reviewers and testers a map from each concern to the code and tests that cover
   it, and a list of known gaps.

### 1.2 Scope

**In scope (1.0.0):**
- A static, client-only web app: chat with streaming replies, threads, folders, prompt
  templates, a command palette, compaction, export and import.
- **Model backends:**
  - in-browser models through WebLLM (WebGPU) in a Web Worker;
  - OpenAI-compatible HTTP endpoints (LM Studio, Ollama, OpenRouter and other
    CORS-enabled servers).
- **Two chat modes:**
  - **Chat:** any model, optional Automatic RAG, no tools.
  - **Workspace:** tool-capable HTTP models, with a per-chat virtual folder and file
    tools, small functions (calculator, CSV query, QuickJS `run_js`), and MCP tools with
    approval.
- **Knowledge libraries:** global, imported from PDF, TXT and Markdown. Chunked,
  embedded through an HTTP embedding endpoint, and searched by hybrid (keyword plus
  vector) retrieval with citations.
- **Release form:** GitHub Pages under `/htllm/`, and a zip of the built site for any
  static server. Both builds and the deploy workflow exist
  (`.github/workflows/release.yml`); the first deploy happens at the first version tag.

**Out of scope:**
- Any server component, account system, sync between devices, telemetry or analytics.
- A shell, processes, git or long autonomous agent loops (htllm is not a coding agent,
  D-1).
- Native OpenAI or Anthropic API providers: their APIs refuse browser CORS.
- OCR, Office documents, persistent memory across chats, conversation branching,
  rendering model-written HTML, and Python in the browser.
- Workspace for WebLLM models (blocked on web-llm limits, §8.2).
- Qualification on Firefox and Safari. 1.0.0 targets Chrome and Edge.

### 1.3 Context

htllm is a personal open-source project, released under the MIT license. Everything runs
in the user's browser tab, and every byte the user creates is stored there, in IndexedDB.
The app talks only to endpoints the user configures:
- model servers;
- MCP servers;
- an embedding endpoint;
- for WebLLM, the model weight host that `@mlc-ai/web-llm` downloads from.

Its constraints come from that position:
- a Content Security Policy delivered by `<meta>`, because a static host may not let you
  set headers;
- CORS on every endpoint the user adds;
- WebGPU availability for in-browser models;
- browser storage quotas.

### 1.4 Intended Audience

| Reader | Uses this document to |
| --- | --- |
| Contributors (engineering) | Learn the layers and invariants (§4, §6.4) and find the component that owns a change (§6.1). |
| Reviewers and QA | Check a change against concerns and traceability (§3.2, §7), and know what the browser suite and evals cover. |
| Self-hosters (operations) | Understand deployment, the base path and CSP, storage, and what leaves the device (§2.2, §4.2, §5.9). |
| Model and tool integrators | Read the provider, tool and MCP contracts (§5.7, §6.2). |

### 1.5 References

| Ref | Document | Version / date |
| --- | --- | --- |
| R-1 | [Roadmap and release gates](../roadmap.md) | Plan to 1.0.0, revised gates 2026-11-23 |
| R-2 | [User guide](../guide.md) | 1.0.0 |
| R-3 | [Compatibility record](../compatibility.md) | Tested versions |
| R-4 | [Evaluation](../../eval/README.md) | Workspace baseline 2026-11-23 |
| R-5 | [CLAUDE.md](../../CLAUDE.md) | Hard constraints and conventions |
| R-6 | 2026-11-23 review and plan of record (`docs/review/2026-11-23.md` and its research notes) | Removed after this rewrite; in git history before the 1.0.0 SDD commit |
| R-7 | `src/data/db.ts` | IndexedDB schema, DB v10 |
| R-8 | `src/layouts/BaseLayout.astro` | Production and development CSP |
| R-9 | `test/browser/chat.spec.ts`, `eval/` | Browser scenarios and evaluation |
| R-10 | `@mlc-ai/web-llm` 0.2.83, `@modelcontextprotocol/client` 2.2.0, `quickjs-emscripten-core` 0.32.0, `pdfjs-dist` 6.3.289, `minisearch` 7.1.2 | Pinned in `package.json` |

### 1.6 Glossary

| Term | Meaning |
| --- | --- |
| Chat mode | A chat without tools. It can use Automatic RAG over an attached library. Default for new chats. |
| Workspace mode | A chat whose model works with files through tools. Chosen on the empty chat and locked at the first message or upload. |
| Workspace | A chat's own virtual folder: `/uploads` (user files, read-only to the model), `/notes` (model-written) and `/library/<name>` (attached libraries, read-only). A store of text records, not a filesystem or runtime. |
| Knowledge library | A global, named set of imported documents with chunks and embeddings. Chats attach libraries; libraries don't belong to chats. |
| Automatic RAG | Chat-mode retrieval: before each reply, the last user message is searched in the chat's library and the evidence goes into the system message. |
| Hybrid retrieval | BM25 keyword scores (MiniSearch) fused with cosine vector similarity over child chunks, returning parent blocks. |
| Source ID | The identifier a model cites as `[[Source <id>]]`. In Workspace it names a file and line range (`atlas:L1-1`). It resolves only against sources supplied in that answer. |
| Presented file | A note version the model hands to the user with `present_file`. It shows as a card that opens that version in the side panel. |
| Context band | One of three limit sets chosen from the context window (up to 8k, 8k–32k, over 32k): read size, result characters and calls per answer (D-29). |
| Approval / trust | Every MCP call waits for the user's allow or deny. "Trust" skips the prompt for one read-only tool for the rest of the session. |
| Compaction | Summarizing older turns into a `<summary>` block when the conversation outgrows its budget. Manual, or automatic when the user opts in. |
| Stub | A short placeholder that replaces an old tool result in history, so it is not replayed in full. |
| Provider | A backend behind the `ChatProvider` interface (WebLLM or an OpenAI-compatible spec). |
| BYOK | Bring your own key: user-supplied API keys, stored only in IndexedDB. |
| D-n | A product decision from the 2026-11-23 review (D-1 to D-31, §8.1). Code comments cite these. Comments such as `D8` (chunk sizes) or `D10b` (compaction) without a hyphen are older Phase 3 planning labels, kept in git history. |
| AD-n | An architectural decision in §8.1. |
| C-n | A design concern in §3.2. |
