# Per-chat file areas in chat apps — survey for htllm Workspace mode

Surveyed 2026-11-23. Read-only: public docs, help-center pages, release notes and source. Nothing installed or run.

Conventions
- Help-center pages show only relative "Updated N days ago" stamps. Approximate absolute dates are given as "~YYYY-MM-DD (relative stamp)".
- GitHub release pages omit the year. Years marked "(year inferred)" come from the page footer or context.
- **UNVERIFIED** = only third-party, forum, or search-snippet evidence, or the official page does not say it.
- Quotes are kept to a minimum. Most items are paraphrased with links.

---

## 1. Comparison table

| App (version / date) | Per-chat file area? | How files reach the model | Model-generated files & download | Simple-chat vs tools/agent split, and how it is surfaced | Models without native tool calling |
|---|---|---|---|---|---|
| **ChatGPT web, Chat** (help pages ~Oct–Nov 2026) | No per-chat panel found. Uploads show in the conversation, and Library (or "Space") is **account-wide**, holding uploaded and generated files with Uploaded/Generated filters | Mixed and undocumented for consumer chat. Spreadsheets go to Python (Data Analysis). Docs go into context up to a threshold, then hybrid search (**Enterprise-documented only**: 110k tokens in context, rest to search) | Python sandbox writes files. In-chat download-link UI is **UNVERIFIED** (not described in help pages). Generated files are auto-saved to Library. Sandbox resets and expired links are common forum complaints | **Chat / Work** toggle (Work = longer multi-step deliverables). Separate model defaults per mode. Sidebar can filter Chat vs Work (desktop). Agent mode was retired in favour of Work | n/a (first-party models) |
| **Claude.ai** (help pages Jul–Nov 2026) | No per-chat panel found (**UNVERIFIED**). Projects hold persistent files | Text extraction into context. PDFs ≤100 pp are read visually. With code execution on, files are also available in a sandbox. Projects switch automatically to RAG (search tool) near the context limit | Code execution creates docx/xlsx/pptx/pdf etc. Files stay downloadable for the rest of the conversation or saved to Google Drive. Paths `/mnt/user-data/uploads` and `/outputs` are **UNVERIFIED** | Capability toggle in Settings, not per chat | n/a |
| **Open WebUI** v0.13.4 (17 Nov, year inferred 2026) | **Yes, conditionally.** With the Pyodide engine, a **Files tab** appears in the chat side panel over one `/mnt/uploads` FS (IDBFS in the browser). Per-chat scoping is **not stated**. Open Terminal (server) gives **each chat its own working folder** in a Files tab | Per file: **Full text** (under a threshold, or forced with "Using Entire Document") or **Focused Retrieval** (RAG). In Native mode with "Preload files" off, the model gets only a **file list** plus `list/query/grep/view_chat_files` tools | Pyodide: files saved to `/mnt/uploads` appear in the Files tab for download. Open Terminal: inline **file cards** with preview, download and "open in file browser" | Native (agentic) tool calling is the default. Built-in tools (files, knowledge, notes, memory…) only in Native. Per-model/per-chat setting | Prompt-based "Legacy" mode kept but **unsupported**. Docs warn that models under ~30B often emit malformed tool JSON |
| **LibreChat** v0.8.9 pre-release (17 Nov, year inferred) | Partly. Files the code writes appear as **rows in the message** and open in the Artifacts side panel. Stateful code sessions (experimental) keep `/mnt/data` per conversation | Default: auto-routed. Text-like files sent as **extracted text, every message**, capped at 100k tokens per file and **silently truncated**. PDFs/images go native if the provider accepts them. File Search (RAG) and Code get files only when a run needs them | Code sandbox (self-hosted ClickHouse code-interpreter) outputs are listed per message with preview and download. "Workspace changes" row in stateful mode | Agents are picked in the model selector or with `@`. Agent capabilities: Run Code, File Search, File Context, Artifacts, MCP | Not documented |
| **LobeHub** (main @ `538613d`, 2026-11-22) | Not a file dir. **Agent Documents** are notes and reports the agent writes, scoped to the agent or linked to a topic, shown in a right-side working panel with history. Uploads go to the account-wide Resource Library | Conflicting sources: Resource Library docs say chunk + embed + semantic search. RFC-115 (2025-05) says chat uploads skip embedding and are inlined as full text | Cloud Sandbox (temporary storage, asks the agent for a download link). Agent Documents are editable in the panel | Agent-centric app: every chat is with an "Agent" in topics. Tools are enabled per agent profile | Model `abilities.functionCall` flags. Plugins depend on function calling. Exact UI gating not found |
| **Jan** v0.8.8 (28 Oct, year inferred 2026) | Projects have a Files panel (chunk counts, progress). Message attachments are per message. Jan Agent works inside a project folder | Projects: chunk + index for retrieval. Attachments: per message, with optional "Use embeddings" (release notes) | Jan Agent file tools write in the project folder with approval (coding-agent style) | Tools/MCP need a model with the "tools" capability. Local models need it toggled in Model Capabilities. Shell switch in the chat tool menu | Docs warn that many open models aren't designed for tools. No fallback documented |
| **AnythingLLM** v1.20.0 (17 Nov, year inferred) | Per-thread attachments (attached files stay in that thread). Workspace-wide embedded docs | **Attach** = full text inline. On overflow it asks: embed / cancel / "Continue Anyway" (prunes). **Embed** = RAG for all threads. **Pin** = full text of an embedded doc | Save Files skill: OS save dialog for location and name (desktop app). Chart generation skill | Workspace chat mode in settings: Agent (default for new workspaces since v1.11.1) / Chat / Query. An "@" icon in the input means you must type `@agent` | Native tool calling where supported. Prompt-based "Untooled" fallback, forced with env `PROVIDER_DISABLE_NATIVE_TOOL_CALLING`. Docs list hallucinated tool calls and invalid JSON from quantized models |
| **big-AGI** (main @ `39fad0a`, 2026-11-20; "Open 2.1.3") | No (**not found**). Attachments are drafts on the composer | Client-side **converters** chosen per attachment: `pdf-text`, `pdf-images`, `pdf-text-and-images`, `pdf-auto`, `docx-to-html`, `xlsx-to-text`, `image-ocr`, `url-page-markdown`… all inlined | Not found | Not found (Beam = multi-model compare) | Not found |
| **Cherry Studio** (v2.x; v2.1.7 seen) | Agents get **accessible paths** (local dirs). File library for attachments *and generated files* | Knowledge bases (local), OCR and doc processing | File library manages generated files | **Assistants** (chat) vs **Agents** (Claude Agent SDK engine) as tabs in one interface since v1.7 | Agent mode originally failed with non-Anthropic models. v2 adds a local translation gateway (maintainer, 2026-07). Prompt-injected tool use in chat: **UNVERIFIED** (blog only) |
| **LM Studio** (docs, undated) | Attachments per chat session | Full inline if it fits the context, otherwise RAG | n/a | n/a | n/a |
| **WebLLM Chat** (mlc-ai, browser-only) | No | Images only. No docs, RAG or tools mentioned | No | No | No tools |
| **Page Assist** (browser extension) | No (not found) | README mentions only chat-with-webpage. Store listing/third-party docs mention a pdf/csv/txt/md/docx knowledge base needing an embedding model (**sources disagree**) | Not found | Not found | Not found |

---

## 2. ChatGPT web, normal chat mode (primary reference)

### What happens to uploads
- **Limits:** 512 MB per document, about 50 MB per spreadsheet, 20 MB per image, and 2M tokens per text/document file (not applied to spreadsheets). Uploads are capped at 80 per 3 hours (Free: 3 per day). Shared storage is capped at 25 GB per user and 100 GB per org. No per-conversation file-count limit is stated. Projects allow 5 to 40 files by plan, and GPTs 20. [File uploads FAQ, ~2026-11-15 ("8 days ago")](https://help.openai.com/en/articles/8555545-file-uploads-faq)
- **Library / Space:** Uploaded and created files are saved automatically to an account-wide **Library** in the sidebar, which **Space** replaces where rolled out. It supports search and filters (Uploaded/Generated, Images/Documents/Spreadsheets/Presentations/PDFs). Files are reused through the composer's "Add from library" item. Storage is 500 MB on Free, 4 GB on Go, 20 GB on Plus/Business and 100 GB on Pro. Temporary Chat uploads are *not* saved. [Library article, ~2026-11-23](https://help.openai.com/en/articles/20001052)
- **Retention:** Deleting a chat does **not** delete its files in Library, which must be deleted separately. Deleted files go to "Recently deleted", with permanent deletion within 30 days. Content from a file can remain in the conversation. Project files are kept until the project or file is deleted. Some Enterprise "transient" files expire after 48 h. [Retention article, ~2026-11-04 ("19 days ago")](https://help.openai.com/articles/8983778); [File uploads FAQ](https://help.openai.com/en/articles/8555545-file-uploads-faq)

### How the model reads files
- **Spreadsheets/data:** Data Analysis writes and runs Python in a stateful Jupyter environment against files available to the session. It has no network access. DataFrames can render as interactive tables, and bar/line/pie/scatter charts can be toggled interactive or static. [Data analysis article, ~Oct 2026 ("last month")](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt)
- **Documents:** For **Enterprise only**, OpenAI documents the mechanism. Up to 110k tokens of uploaded docs go fully into context. Beyond that, a 55k-token budget is split across docs and the rest goes to a private hybrid (keyword + semantic) index. GPT-series models run one search per prompt, and o-series models run 2–3. Spreadsheets *always* go to Code Interpreter. [Optimizing file uploads (Enterprise), ~2026-10-28](https://help.openai.com/en/articles/10029836). **UNVERIFIED** whether consumer chat uses the same thresholds.
- **Sandbox path `/mnt/data` and `sandbox:/mnt/data/...` download links:** These are widely visible in transcripts and forums but **not documented** by OpenAI (**UNVERIFIED** as a spec). A January 2026 analysis shows a richer container with tools such as `container.exec`, `container.download` (only for URLs already seen in the conversation, an anti-exfiltration measure) and `python_user_visible.exec`. [Simon Willison, 2026-01-26](https://simonwillison.net/2026/Jan/26/chatgpt-containers)

### Producing downloadable files
- The help pages mention downloading generated outputs but don't describe the UI. The Academy page mentions downloading generated outputs such as updated spreadsheets or PDFs, without describing the UI. [OpenAI Academy, 2026-04-10](https://openai.com/academy/working-with-files). Generated files are auto-saved to Library ([Library](https://help.openai.com/en/articles/20001052)).
- **Idle-expiry TTL (15–30 min) is UNVERIFIED.** It comes only from a third-party write-up ([fast.io](https://fast.io/resources/code-interpreter-session-expired-chatgpt-download/)). The forum evidence on failures is below.

### UI
- Uploads go through the composer's tools menu ("Add photos or files"), and the same menu lists Create image, Deep research and Web search ([Academy](https://openai.com/academy/working-with-files)).
- **No per-chat "files in this chat" panel was found in any official source.** The file area is account-wide (Library), plus Projects (Files per project).

### ChatGPT Work (context for mode discovery only; not the user's reference)
- "ChatGPT agent" is retired, and the help page now points to **ChatGPT Work** for longer multi-step tasks and finished deliverables ([agent article, ~2026-10-28](https://help.openai.com/en/articles/11752874)).
- Work is reached through a **Chat/Work toggle** on desktop, by selecting Work on web, or from the model-name picker on mobile. Work and Chat chats share Recents, and desktop can filter by mode. **Work and Chat have separate model choices and separate default settings.** Choosing Work inside a project starts a Work chat with that project's context. [ChatGPT Work and Codex, 2026-11-23](https://help.openai.com/articles/20001275)
- Work outputs (docs, sheets, decks, reports, Sites) are saved to Library/Space when created in the cloud. Users refine them by selecting a part and describing the change. [Work documents article, ~2026-11-01](https://help.openai.com/en/articles/20001278)
- Whether a chat's mode can be switched after creation: **UNVERIFIED**.

---

## 3. Claude.ai (brief)

- **Uploads:** up to 500 MB per file and 20 files per chat. PDFs are limited to 1000 pages, with visual analysis up to 100 pages and text-only beyond that. Non-PDF docs are text-extracted (embedded images are not read). Project files are limited to 30 MB each, with unlimited count as long as they fit the context. [Upload files to Claude, updated 2026-07-23](https://support.claude.com/en/articles/8241126)
- **Projects auto-RAG:** RAG switches on automatically as a project nears the context limit (up to 10× capacity) and uses a project-knowledge search tool. A visual indicator shows RAG mode, and the project reverts to in-context when it is small enough. Available on paid plans. [RAG for projects, ~late Oct 2026](https://support.claude.com/en/articles/11473015). A user report of RAG triggering at about 13 files regardless of size is **UNVERIFIED** (single issue, seen only in a search snippet).
- **File creation:** code execution creates and edits xlsx/pptx/docx/pdf, runs analysis and renders charts. Limits are 30 MB per file for upload/download in the computing environment, and larger PDFs can be processed there without entering context. Files stay downloadable for the rest of the conversation and can be saved to Google Drive. Container lifetime is limited but no duration is given. Network egress is tiered by plan and configurable by admins. Project files are accessible in the environment. The feature is enabled in Settings → Capabilities. [Create and edit files, ~early Nov 2026](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)
- **Paths:** `/mnt/user-data/uploads` for uploads and `/mnt/user-data/outputs` for deliverables, using a "present files" step. This is **UNVERIFIED** and community-observed ([DEV post](https://dev.to/h1gbosn/inside-claudes-sandbox-what-happens-when-claudeai-creates-a-file-4gna)).
- **Per-chat files panel:** none found in official docs (**UNVERIFIED**).

---

## 4. Open-source and local-first apps

### Open WebUI (v0.13.4, 17 Nov; year inferred 2026; [releases](https://github.com/open-webui/open-webui/releases))
Open WebUI is the closest prior art for htllm's Workspace.
- **Two ways files reach the model** ([RAG docs](https://docs.openwebui.com/features/chat-conversations/rag.md)):
  - *Preload files* on: attachments are RAG-processed and injected. This is off by default with Native function calling and on with Legacy.
  - *Preload files* off: no content is injected. With Native or Default function calling, the model sees a **list of attached files** and uses the built-in Files tools `list_chat_files`, `query_chat_files`, `grep_chat_files`, `view_file` and `display_file`.
  - A 2×2 table in the docs combines Preload × Builtin Tools: full agentic, traditional RAG, tools-only, or files ignored.
- **Per-file mode:** "Using Entire Document" injects the full text every message. Files under a configurable Full Text Threshold are included in full automatically. The user's default upload mode is set in Settings → Interface → File. ([RAG docs](https://docs.openwebui.com/features/chat-conversations/rag.md))
- **Built-in tool categories in Native mode:** Files, Knowledge Base (`query_knowledge_bases`, `grep_knowledge_files`, `view_knowledge_file`…), Notes (`write_note`, `replace_note_content`), Memory, Code Interpreter (`execute_code`), Web, Image, and others. An optional `kb_exec` gives a shell-like interface over knowledge bases. [Tools docs](https://docs.openwebui.com/features/extensibility/plugin/tools.md)
- **Tool-calling modes:** Native is the default and the only mode with built-in tools. The prompt-injected "Legacy" mode is kept for reference only and is unsupported. The docs warn that models under about 30B often produce malformed JSON or fail multi-step chains, and recommend a stronger model. ([Tools docs](https://docs.openwebui.com/features/extensibility/plugin/tools.md)). The claim that v0.10.0 made Native the default is **UNVERIFIED** (search snippet only).
- **Browser-side file area (Pyodide engine):** a persistent virtual FS at `/mnt/uploads/` **backed by IndexedDB (IDBFS)**. Chat attachments are copied into it before code runs, and a **Files tab in the chat side panel** lets users browse, preview, upload, download and delete. Files persist across reloads only with `ENABLE_PYODIDE_FILE_PERSISTENCE`. Pyodide is labelled legacy, with possible future deprecation. [Python code execution docs](https://docs.openwebui.com/features/chat-conversations/chat-features/code-execution/python.md)
- **Open Terminal (server-side; licensing **UNVERIFIED**, a search snippet said Terminals uses an Open WebUI Enterprise License):** each chat has its own working folder in a Files tab, with previews for code, PDF, CSV, Office, Markdown, images and HTML (sandboxed iframe). The model can show a file inline as a **card** with name, preview, download and "open in file browser". A setting chooses Sidebar or Inline fallback. [File browser docs](https://docs.openwebui.com/features/open-terminal/file-browser.md)
- **Failure modes it documents:** empty extraction, an Ollama default context (4096 on GPUs under 24 GiB) too small for injected content, **Open WebUI does not trim retrieved content to fit context**, stale embeddings after a model change, chat files not covered by re-index, and the model ignoring knowledge in Native mode because it never calls the tool. [RAG troubleshooting](https://docs.openwebui.com/troubleshooting/rag.md)

### LibreChat (v0.8.9 pre-release, 17 Nov; v0.8.8 01 Oct; [releases](https://github.com/danny-avila/LibreChat/releases))
- **Upload routing:** by default the user doesn't pick a destination. Text, code, CSV, JSON, Word and Excel are sent as extracted text. Images, audio, video and PDFs go native when the provider supports them. File Search and Run Code receive files only when a run needs them. An admin-enabled legacy menu offers explicit Upload as Text / to Provider / for File Search. Pastes over 2,500 characters become `pasted-text.txt`. **Text beyond the per-file token limit (default 100k) is dropped without warning.** Users can raise the limit per conversation. [Upload as text](https://www.librechat.ai/docs/features/upload_as_text)
- **Generated files:** code outputs appear as rows in the message. Clicking a row opens it in the Artifacts panel, with previews for HTML/MD/code/CSV/Office and inline images up to 1 MiB. Runs are stateless by default. Experimental stateful sessions keep `/mnt/data`, scoped by user, agent+user or conversation, show a "Workspace changes" row, and are described as a scratch area that can be reset at any time. [Code interpreter](https://www.librechat.ai/docs/features/code_interpreter)
- **Agents vs chat:** agents are chosen in the model selector, the marketplace or with `@`. Capabilities include Run Code, File Search (described as a poor fit for CSV/Excel), File Context (text included every message), Artifacts and MCP. The **Run Code button on code blocks works in any conversation**, not only agents. [Agents](https://www.librechat.ai/docs/features/agents)
- No-tool-calling handling: not documented.

### LobeHub (formerly LobeChat; main @ [`538613d`](https://github.com/lobehub/lobehub/commit/538613d2181f33137055c958b28d59f6e812e17a), 2026-11-22)
- **Agent Documents:** notes, reports and reference docs the agent writes. They are scoped to the Agent by default or linked to the current topic, read and edited in a right-side working panel, and have version history. Uploaded files live separately in the Resource Library. [agent-documents.mdx @ 538613d](https://github.com/lobehub/lobehub/blob/538613d2181f33137055c958b28d59f6e812e17a/docs/usage/agent/agent-documents.mdx)
- **Resource Library:** account-wide. Chat uploads are saved there automatically, and it supports chunking + embedding + semantic search ([resource docs](https://lobehub.com/docs/usage/getting-started/resource)). This **conflicts** with [RFC-115 (2025-05-08)](https://lobehub.com/blog/rfc-115), which says chat uploads skip chunking and embedding and are injected as full document text. Current behaviour is **UNVERIFIED**.
- **Topic deletion** offers an option to also delete images and files uploaded in the topic. [topic.mdx @ 538613d](https://github.com/lobehub/lobehub/blob/538613d2181f33137055c958b28d59f6e812e17a/docs/usage/agent/topic.mdx)
- **Cloud Sandbox:** temporary storage, so users should save important files promptly and ask the agent for a download link. The conversation keeps context but not files or processes. [sandbox.mdx @ 538613d](https://github.com/lobehub/lobehub/blob/538613d2181f33137055c958b28d59f6e812e17a/docs/usage/agent/sandbox.mdx)
- **No-tools models:** models carry an `abilities.functionCall` flag, and maintainers say plugins rely on function calling ([discussion #875](https://www.github.com/lobehub/lobe-chat/discussions/875)). Exact UI gating was not found.

### Jan (v0.8.8, 28 Oct; year inferred 2026; [releases](https://github.com/janhq/jan/releases))
- Attachments belong to a single message. **Projects** chunk and index files for retrieval across all project conversations and show a Files panel with chunk counts. Image/audio options appear only when the model has those capabilities. [File upload docs](https://docs.jan.ai/desktop/file-upload)
- Release notes for v0.8.8/v0.8.7 report several changes. An attachment that was re-sent with every turn is now sent once per request. "Use embeddings" document mode was fixed behind a proxy. A Shell switch was added to the chat tool menu. Attaching a doc no longer moves a thread out of its project. Agent file tools are confined to their workspace. ([releases](https://github.com/janhq/jan/releases))
- **Tools/MCP:** need a model with the tools capability, which local models get by enabling it in Model Capabilities. The docs warn that many open models aren't designed for tools. Each tool call needs approval through inline cards. [MCP docs](https://docs.jan.ai/desktop/mcp)
- Jan Agent (CLI/desktop) is a coding-agent style tool that works in a launched folder: reads run freely, writes need approval. [Agent files](https://www.jan.ai/docs/agent/files)

### AnythingLLM (v1.20.0, 17 Nov; year inferred; [releases](https://github.com/Mintplex-Labs/anything-llm/releases))
- **Attach / Embed / Pin:**
  - Attach inserts the full text and stays scoped to the thread.
  - When attachments overflow the context, the app asks the user to embed instead, cancel, or "Continue Anyway". The last option silently prunes context, and the docs advise against it.
  - Embed is RAG for every thread in the workspace.
  - Pin is full text of an already-embedded doc and is excluded from RAG results.
  - [Using documents in chat, v1.8.5+](https://docs.anythingllm.com/chatting-with-documents/introduction)
- **Modes:** each workspace's chat settings choose Agent (default for new workspaces after v1.11.1), Chat, or Query (documents only). An **"@" icon in the prompt input** tells the user they must type `@agent`. Native tool calling is on where the provider supports it, with a prompt-based fallback forced by `PROVIDER_DISABLE_NATIVE_TOOL_CALLING`. [Chat modes](https://docs.anythingllm.com/features/chat-modes). Release v1.20.0 mentions the "Untooled" prompt-based path ([releases](https://github.com/Mintplex-Labs/anything-llm/releases)).
- Some providers don't allow automatic tool detection, and the user must then invoke `@agent` manually ([agent overview](https://docs.anythingllm.com/agent/usage/overview)).
- **Small models:** the docs list hallucinated tool calls (an answer with no "thought" log is likely made up), refusals, and invalid JSON from quantized models. They suggest a cloud model for agent calls only, disabling unused tools, or `/reset`. [Agent not using tools](https://docs.anythingllm.com/agent-not-using-tools)
- **Outputs:** the Save Files skill opens a save dialog to pick location and name ([save files](https://docs.anythingllm.com/agent/usage/save-files)). Chart Generation is also a skill.

### big-AGI (main @ [`39fad0a`](https://github.com/enricoros/big-AGI/commit/39fad0a0dde0efbcc4d7dea6d4d7340646e6fd10), 2026-11-20)
- Local-first web app that stores data locally ([README](https://github.com/enricoros/big-AGI)).
- Attachments are composer "drafts" whose **converter is chosen per file**: `pdf-text`, `pdf-images`, `pdf-images-ocr`, `pdf-text-and-images`, `pdf-auto`, `docx-to-html`, `xlsx-to-text`, `image-ocr`, `image-caption`, `url-page-markdown`, `youtube-transcript`, and `ego-fragments-inlined` (re-attach content from another conversation). [attachment.types.ts @ 39fad0a](https://github.com/enricoros/big-AGI/blob/39fad0a0dde0efbcc4d7dea6d4d7340646e6fd10/src/common/attachment-drafts/attachment.types.ts)
- Not found: per-chat file area, mode split, or no-tool handling.

### Cherry Studio (v2.x)
- v1.7.0-beta added **Agents alongside Assistants** in one interface with tabs. Agents run on the Claude Agent/Code SDK with per-agent tool permissions, **accessible paths** and MCP, and have dedicated sessions. [v1.7.0-beta.1 notes](https://newreleases.io/project/github/CherryHQ/cherry-studio/release/v1.7.0-beta.1)
- A file library manages attachments *and generated files* ([README](https://github.com/CherryHQ/cherry-studio)).
- [Issue #17260](https://github.com/CherryHQ/cherry-studio/issues/17260) (2026-07-22): OpenAI-compatible models failed in Agent mode while working in Chat mode. The maintainer said v2 adds a local translation gateway and pluggable runtimes. It is a useful cautionary tale about tying a mode to one engine.
- Prompt-based tool injection in chat is **UNVERIFIED** (from a [cnblogs](https://www.cnblogs.com/rslai/p/19171636) packet-capture blog).

### Others
- **LM Studio:** a document is added in full if it fits the model's context, otherwise RAG is used. Attachments belong to the chat session. [RAG docs](https://lmstudio.ai/docs/app/basics/rag)
- **WebLLM Chat** (mlc-ai, browser-only, htllm's reference): image upload only. Documents, RAG and tools are not mentioned. [README](https://github.com/mlc-ai/web-llm-chat)
- **Page Assist** (browser extension; Ollama, Chrome AI, OpenAI-compatible): data stays in browser storage. The README covers chat-with-webpage only. The store listing mentions chatting with pdf/csv/txt/md, and third-party docs mention a knowledge base needing an embedding model. Document behaviour is **UNVERIFIED**. [README](https://github.com/n4ze3m/page-assist), [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/page-assist/)

---

## 5. Patterns for mode discovery and showing a chat's files

**Mode discovery**
1. **ChatGPT Chat/Work toggle** ([source](https://help.openai.com/articles/20001275)): two named modes with one-line purposes (quick conversational help vs longer multi-step work with finished deliverables). Each mode has its **own model default**. Chats from both modes share Recents but can be filtered by mode. This is the closest analogue to htllm's Chat/Workspace.
2. **AnythingLLM "@" indicator:** a visible glyph in the input tells the user that tools are *not* automatic in this context, which keeps a capability boundary visible ([source](https://docs.anythingllm.com/features/chat-modes)).
3. **Capability gating by model flags** (Jan tools capability, LobeHub `functionCall`, Jan's image/audio buttons that appear only for capable models): this hides unsupported options instead of failing ([Jan](https://docs.jan.ai/desktop/file-upload)).
4. **Cherry Studio Assistants | Agents tabs:** the split is discoverable, but the issue thread shows users then hit "works in Chat, fails in Agent" with unsupported models ([#17260](https://github.com/CherryHQ/cherry-studio/issues/17260)). Explain why a model is unavailable for a mode.
5. **Composer tools menu (ChatGPT):** uploads and tools sit behind one "+" menu ([Academy](https://openai.com/academy/working-with-files)). Discoverable, but it is a per-message toggle, not a per-chat contract.

**Showing a chat's files**
1. **Side-panel Files tab scoped to the chat** (Open WebUI Pyodide/Open Terminal): browse, preview, upload, download and delete ([Pyodide](https://docs.openwebui.com/features/chat-conversations/chat-features/code-execution/python.md), [Open Terminal](https://docs.openwebui.com/features/open-terminal/file-browser.md)).
2. **Inline file cards in replies** with preview, download and "open in panel" (Open WebUI Open Terminal). LibreChat uses per-message file rows that open in the Artifacts panel ([LibreChat](https://www.librechat.ai/docs/features/code_interpreter)).
3. **Right-side working panel for agent-written docs, with history** (LobeHub Agent Documents).
4. **Library filters Uploaded vs Generated** (ChatGPT) are a good filter pair even at chat scope.
5. **Mode indicator per file**: full text vs searched (Open WebUI "Using Entire Document" per file; Claude Projects' RAG indicator).
6. **Delete semantics are explicit**: ChatGPT keeps Library files when a chat is deleted. LobeHub asks whether to delete a topic's uploads with it.

---

## 6. Known failure modes users hit

| Failure | Evidence |
|---|---|
| **Sandbox reset wipes uploaded files mid-conversation**, with a request to re-upload, even during active use; one user reported seeing another customer's files | [OpenAI forum, Jan–Feb 2025](https://community.openai.com/t/it-seems-that-the-code-execution-environment-was-reset-which-removed-access-to-previously-uploaded-files-could-you-please-re-upload/1088172) |
| **Uploaded files reported as expired** | [OpenAI forum](https://community.openai.com/t/it-seems-that-some-of-the-files-youve-previously-uploaded-have-expired/1005280); [status incident](https://status.openai.com/incidents/01KA22ACNT50TDGYE1B9TJ86D2) (thread title and search summary only, not read) |
| **Download links for generated files dead** (`sandbox:/mnt/data/...` links, session-expired errors) | [forum 1](https://community.openai.com/t/issue-downloading-pptx-file-created-using-python-code-in-chatgpt-the-code-interpreter-tool-session-has-expired/769469), [forum 2](https://community.openai.com/t/sandbox-downloads-broken-for-over-a-month-no-fix-no-eta-no-response-from-leadership/1250398) (thread titles only, not read) |
| **Silent truncation of long files** (LibreChat drops text past 100k tokens without warning) | [LibreChat docs](https://www.librechat.ai/docs/features/upload_as_text) |
| **Context overflow pruning** ("Continue Anyway" in AnythingLLM). Open WebUI doesn't trim, and the default Ollama context is too small | [AnythingLLM](https://docs.anythingllm.com/chatting-with-documents/introduction), [Open WebUI](https://docs.openwebui.com/troubleshooting/rag.md) |
| **Attachment re-sent every turn** (token bloat; fixed in Jan v0.8.8). LibreChat File Context and Open WebUI "Using Entire Document" do this *by design* | [Jan releases](https://github.com/janhq/jan/releases) |
| **Stale indexes:** chat-file embeddings not re-indexed after an embedding-model change | [Open WebUI RAG docs](https://docs.openwebui.com/features/chat-conversations/rag.md) |
| **Model ignores attached knowledge** because, in tool mode, nothing is injected and the model never calls the search tool | [Open WebUI troubleshooting](https://docs.openwebui.com/troubleshooting/rag.md) |
| **Hallucinated tool calls / invalid JSON from small or quantized models** | [AnythingLLM](https://docs.anythingllm.com/agent-not-using-tools), [Open WebUI tools](https://docs.openwebui.com/features/extensibility/plugin/tools.md) |
| **Mode tied to one engine fails for other models** | [Cherry Studio #17260](https://github.com/CherryHQ/cherry-studio/issues/17260) |
| **"Wrong file" confusion** (model answering from an older or other upload) | **No specific issue found.** Plausible with chat-wide RAG, where chunks from any file compete. Not evidenced. |

---

## Borrow for htllm

Each item was checked against htllm's constraints (no server, no code runtime, small WebLLM models without tools, tool-capable HTTP models).

1. **Expose the workspace through file-shaped tools, not injection.** For reads, model them on Open WebUI's read-only chat-file tools (`list_chat_files`, `grep_chat_files`, `query_chat_files`, `view_file`). Add small write tools (`write_file` / `replace_in_file`) of htllm's own. *Why:* Open WebUI shows a model can work with a chat's files through tools, with no sandbox and small context. **No surveyed app has a chat-scoped *write* tool without a sandbox.** The nearest write precedents are Open WebUI Notes (`write_note` / `replace_note_content`, a separate feature) and LobeHub Agent Documents.
2. **Store every workspace file as a durable IndexedDB record with no TTL.** *Why:* expired files and dead download links are a well-documented complaint about ChatGPT (forum threads), and LibreChat's and LobeHub's own docs warn that their sandbox storage is temporary or resettable. htllm has no container, so it can avoid this entirely. Open WebUI's Pyodide FS on IDBFS shows browser-side persistence is feasible.
3. **A chat-scoped Files side panel** (preview, download, delete, Uploaded / Generated / Knowledge groups), **plus inline file cards in replies** that open in the panel. *Why:* no per-chat file view was found in ChatGPT's or Claude's official docs, where ChatGPT's Library is account-wide. Open WebUI (Open Terminal per-chat folder + file cards) and LibreChat (file rows → Artifacts panel) show the pattern.
4. **Make each file's read mode visible and switchable** ("full text" vs "searched"), auto-picked by size against the current model's context, and **warn instead of silently truncating**. *Why:* silent truncation and pruning (LibreChat, AnythingLLM, Open WebUI with Ollama) is a recurring documented failure. LM Studio (chat attachments), Claude **Projects** and ChatGPT **Enterprise** all switch from full text to retrieval by size.
5. **New-chat screen: a two-option Chat / Workspace control with one-line purposes and a per-mode default model**, with the mode shown on each chat in the sidebar. *Why:* this mirrors ChatGPT's Chat/Work toggle (separate model defaults, filterable Recents), which is the closest shipping analogue.
6. **Gate Workspace on a model tool-capability flag and say why a model is unavailable. Don't ship a prompt-based tool-calling fallback.** *Why:* Open WebUI dropped support for its Legacy prompt mode and warns about models under 30B. AnythingLLM documents hallucinated calls and bad JSON. Cherry Studio users hit "works in Chat, fails in Agent".
7. **Mount attached Knowledge libraries as read-only folders searched through the same tools, and nudge the model in the system prompt to search them.** *Why:* Open WebUI's troubleshooting docs list "model ignores attached knowledge because it never calls the tool" among Native-mode failures. A read-only mount also prevents edits to the global library.
8. **Make chat-deletion semantics explicit** with an "Also delete this chat's files?" option. One htllm-specific suggestion (not seen elsewhere): an explicit "save to Knowledge" action that lets an output outlive the chat. *Why:* ChatGPT, where Library files outlive a deleted chat, and LobeHub, which asks when a topic is deleted, show users need to be told what happens.
