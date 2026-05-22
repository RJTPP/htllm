## 1. Introduction

This SDD describes the Phase 1 (Foundation) design of **htllm** — a fully client-side WebGPU chat application that runs large language models entirely in the browser. It covers the architecture, component design, data model, and UI for the initial release.

### 1.1 Purpose

This document enables:

1. **Implementation handoff** — developers can build Phase 1 from this spec without ambiguity about component boundaries, data flow, or provider contracts.
2. **Design review** — stakeholders can validate that hard constraints (no server, no secrets, no telemetry) are structurally enforced, not just policy.
3. **Phase 2+ planning** — the extension points (provider registry, data layer migrations, component slots) are documented for future phases.

### 1.2 Scope

**In scope (Phase 1):**

- Astro 5 static site scaffold with React 18 islands
- `ChatProvider` abstraction and provider registry
- WebLLM provider running inference in a Web Worker
- IndexedDB persistence: threads, messages, provider keys, settings, prompt templates
- Multi-thread sidebar with create/switch/delete
- Model picker popup with search, family grouping, parameter controls
- System detection rail (WebGPU, RAM, CPU, storage, network)
- Chat panel with streaming, vision/image attach, throughput display
- Prompt templates with `/` trigger in composer
- Full data import/export (JSON)
- CSP enforcement via `<meta>` tag

**Out of scope (deferred to later phases):**

- Phase 2: Ollama, LM Studio, Groq, OpenRouter providers
- Phase 3: In-browser RAG (embeddings, vector store, document upload)
- Phase 4: Agent loop with function calling
- Phase 5: Markdown rendering, code highlighting, conversation branching, voice input, i18n

### 1.3 Context

htllm exists because current LLM chat interfaces either require a server (ChatGPT, Claude) or send data to third-party APIs. htllm's value proposition is zero-server inference with a privacy guarantee enforced by architecture, not policy. The prototype (`prototype/index.html`) demonstrates feasibility in a single 770-line HTML file; this SDD designs the production-grade version.

The reference architecture `mlc-ai/web-llm-chat` (Apache 2.0) informs worker patterns, model parameter handling, and UI conventions, but htllm diverges significantly in its provider abstraction, IndexedDB-first persistence, static-only deployment, and multi-phase roadmap.

### 1.4 Intended Audience

| Audience | How to use this SDD |
|---|---|
| **Developers** | Sections 4–6, 11–12 for architecture, component boundaries, and data model. Section 13 for UI specs. |
| **Reviewers** | Sections 3, 7–8 for constraint validation and design rationale. |
| **Future contributors** | Section 5 (viewpoints) for system understanding; Section 16 for locked decisions. |

### 1.5 References

| Identifier | Description |
|---|---|
| `prototype/index.html` | Frozen single-file prototype (behavior reference) |
| [mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) | WebLLM library for in-browser inference |
| [mlc-ai/web-llm-chat](https://github.com/mlc-ai/web-llm-chat) | Reference chat UI (Apache 2.0), analyzed for patterns |
| [Astro docs](https://docs.astro.build) | Framework documentation |
| [idb](https://github.com/jakearchibald/idb) | IndexedDB wrapper library |

### 1.6 Glossary

| Term | Definition |
|---|---|
| **BYOK** | Bring Your Own Key — user provides their own API key for a cloud provider |
| **ChatProvider** | The abstraction interface that all LLM backends implement |
| **Island** | An Astro concept: an interactive UI component hydrated on the client while the rest of the page is static HTML |
| **Provider** | An LLM backend (WebLLM, Ollama, Groq, etc.) implementing the `ChatProvider` interface |
| **Thread** | A conversation: a sequence of messages between user and assistant, persisted in IndexedDB |
| **WebGPU** | Browser API for GPU-accelerated computation, used by WebLLM for inference |
| **WebLLM** | `@mlc-ai/web-llm` — library that compiles and runs LLM models in-browser via WebGPU |
| **Worker** | Web Worker — a background thread that runs WebLLM inference without blocking the UI |
| **Quantization** | Model compression technique (q4, q8, etc.) that reduces VRAM requirements |
| **Fit** | Whether a model's VRAM requirement is within the device's estimated GPU memory budget |
