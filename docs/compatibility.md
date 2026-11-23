# Compatibility

What 1.0.0 was checked against, with exact versions. "Checked" means it was run and
seen working on that setup. Anything not in the tables is expected to work but not
verified.

Checked on 2026-11-23, on macOS 27.0.1, against the production build (strict CSP)
served on `localhost`.

## Live checks (real servers)

| Check | Setup | Result |
| --- | --- | --- |
| Chat with Automatic RAG, cited answer | LM Studio 0.4.28+2, chat model `gemma-4-26b-a4b-it` (loaded with 16,384 context; the chat used 8,192), embedding model `text-embedding-embeddinggemma-300m-qat`, a Markdown file in the Default library | Passed. The model list and embeddings were reached over CORS. The answer cited two supplied sections (date and budget) and said the third fact wasn't in its context. Retrieval had returned only two of the three relevant sections. |
| Workspace: attach, read, write, present, open the card | The same LM Studio model; a Markdown upload | Passed. The small upload was included whole; the model ran `write_file` and `present_file`; the card opened v1 in the side panel. The note's facts matched the upload, and the reply's citation resolved to it. |
| Workspace eval baseline (25 tasks × 3 runs) | The same LM Studio model, keyword search only | Recorded in [eval/README.md](../eval/README.md#results): facts 25 of 25; citations were weak for research answers. |
| One real MCP tool with approval | `@modelcontextprotocol/server-everything` 2.2.1 over Streamable HTTP on `localhost:3001` | Reported working by the owner (approval prompt and result not separately recorded). |
| In-browser WebLLM chat | `@mlc-ai/web-llm` 0.2.83, `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (the first Qwen2.5 0.5B Q4 option), production build on `localhost` | Passed (run by the owner): the model loaded on WebGPU and replied in a Chat-mode chat. |

### From the hosted site (`https://htllm.rjtpp.com`, release `v1.0.0`)

| Check | Result |
| --- | --- |
| Site served by GitHub Pages | Passed: landing page, app, icons and link-preview image load; HTTP redirects to HTTPS; no third-party requests; no console errors. |
| LM Studio from the HTTPS origin | Passed in the owner's Chrome, after allowing local network access. The Claude desktop app's built-in browser blocks `localhost` requests from a public origin (`ERR_BLOCKED_BY_CLIENT`), so use a regular browser there. |
| `run_js` worker under the live CSP | Passed: the QuickJS wasm is served as `application/wasm`; a script read a supplied file and returned the right value; `fetch`, timers, `document`, `indexedDB` and `postMessage` were all undefined; an infinite loop stopped at its deadline. |

Browsers used: Chrome 157.0.8103.79 for the automated suite, and Chromium 156 (the
Claude desktop app's built-in browser) for the live checks.

## Automated checks

| Component | Version | What it covers |
| --- | --- | --- |
| Node / pnpm | 26.13.1 / 11.2.2 | Typecheck, 208 unit tests, the deterministic eval, static build |
| Playwright + Chrome | 1.63.0 + Chrome 157.0.8103.79 | 41 scenarios against the production build, under base `/` and `/htllm/`. Model and MCP servers are mocked, so these check app behavior and the CSP, not real-server CORS. |
| MCP client | `@modelcontextprotocol/client` 2.2.0 | Discovery, approval, denial and reload against a Streamable HTTP fixture |
| PDF.js | 6.3.289 | Text extraction with page offsets; image-only PDFs rejected |
| DOMPurify | 3.4.16 | Unsafe HTML and URLs removed from model output |
| QuickJS | `quickjs-emscripten-core` 0.32.0 | `run_js` in its worker under the production CSP |

Reproduce:

```sh
pnpm typecheck && pnpm test && pnpm eval
pnpm build && pnpm test:browser
pnpm build:subpath && pnpm test:browser:subpath
```

## Not verified

- **Model servers:** Ollama, vLLM, llama.cpp's server, and cloud gateways such as
  OpenRouter. They use the same OpenAI-compatible path and are expected to work;
  reasoning replay under the `reasoning` field (Ollama) was only tested with mocks.
- **Browsers:** Firefox and Safari. Edge isn't separately checked either; it shares
  Chrome's engine.
- **The Docker MCP gateway** (0.44.3): it can't be used from a browser directly, because
  it rejects the CORS preflight.
- **Other model families** in Workspace (Qwen, Llama, gpt-oss): only Gemma 4 was used live.
