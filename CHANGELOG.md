# Changelog

All notable changes to htllm are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] - Unreleased

The first public release. Everything below is new.

### Chat

- **Models:**
  - in-browser models through WebLLM, on WebGPU, in a Web Worker;
  - OpenAI-compatible HTTP servers: LM Studio, Ollama, OpenRouter, and any
    CORS-enabled endpoint.
- **Basics:** streaming replies, threads, folders, prompt templates, a command palette,
  and search.
- **Reasoning:** reasoning models' thinking is shown in its own section, whether it
  arrives separately or as tags in the text.
- **Long chats:** conversations are compacted, by hand or automatically, and old tool
  results become short stubs.
- **Context:** the context window is read from the server when it reports one, and a
  budget meter shows how much of it is in use.
- **Data:** export and import of all data, with validation. Keys are never exported.

### Chat and Workspace modes

- **Locked modes:** each chat is either Chat or Workspace, chosen on the empty chat and
  locked at the first message or upload. New chats open in the mode last picked, and
  each mode keeps its own default model.
- **Chat:** no tools, with optional Automatic RAG over a Knowledge library.
- **Workspace:** a per-chat folder with `/uploads` (read-only), `/notes` (the model's)
  and `/library/<name>` (attached libraries, read-only). Tools:
  - `list_files`, `read_file`, `search`, `grep`, `write_file`, `edit_file`,
    `copy_file` and `present_file`;
  - functions: `calculate`, `query_csv`, and `run_js`, which runs short JavaScript in
    a QuickJS sandbox with no network.
- **Presented files:** shown as cards that open the presented version in a side panel,
  with version history and download.
- **Limits** scale with the model's context window; at the cap, "continue" picks up
  where the answer stopped.
- **Tool support** is detected per model from server metadata, with a manual override.

### Knowledge

- **Global libraries:** import PDF (text layer), Markdown and text files, with
  parent-child chunks and page offsets.
- **Search:** hybrid keyword and vector retrieval through an OpenAI-compatible
  embedding endpoint.
- **Citations** resolve only against the evidence supplied to that answer. Models can
  cite by source ID, file name, or file and line.
- **Add to library:** sends a Workspace upload into a library, with its pages.

### MCP

- **Connections:** Model Context Protocol servers over Streamable HTTP, in Workspace
  chats.
- **Approvals:** every call needs approval; read-only tools can be trusted for the
  session. Calls with an unknown outcome are never retried.

### Privacy and hosting

- **No backend:** no account, no telemetry, no third-party requests. Fonts and icons
  are self-hosted.
- **Strict CSP:** a strict Content Security Policy with no `eval`. Model output is
  sanitized, and HTML and SVG files are shown as code.
- **Hosting:** at `https://htllm.rjtpp.com`, on its own origin, and as an offline zip
  for any static server.
