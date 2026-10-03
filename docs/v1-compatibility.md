# v1 compatibility and qualification

Checked 2026-10-03. These are local implementation results, not a published release.
Implementation checkpoint: `0cf20dc`, based on `dev` merge `24c1177` (PR #28).
The feature branch has not been pushed or release-tagged.

| Component | Version / configuration | Evidence and boundary |
| --- | --- | --- |
| Node / pnpm | 26.8.2 / 11.2.2 | Unit tests, evaluation harness, typecheck, static build |
| Chrome | 154.0.8037.97, headless macOS | Production CSP, HTTP without WebGPU, PDF pages, saved citations, built-in agent, MCP approval/denial/reload fixtures |
| Playwright | 1.63.0 | Browser fixture runner; no real model/server qualification implied |
| MCP client | `@modelcontextprotocol/client` 2.2.0 | Browser bundle and legacy Streamable HTTP fixture (2025-11-25); automatic SDK negotiation enabled |
| PDF.js | 6.3.289 | Generated one-page text PDF fixture under production CSP |
| DOMPurify | 3.4.16 | Unsafe HTML/URLs and remote Markdown images removed |
| Reference HTTP model | `qwen3.6-35b-a3b@iq4_xs` through `localhost:1234/v1`, user-managed LM Studio proxy | Live Chrome RAG answer and sequential `list_documents` / `read_document` passed with saved evidence and reload; full rubric pending. User reports 13,312 chat context; browser smoke used 8,192. No token required. |
| Reference embeddings | `text-embedding-embeddinggemma-300m-qat` on the same endpoint | Live retrieval of the user's indexed one-chunk test file passed. User reports 2,048 embedding context; long-input boundary not qualified. |
| Docker MCP Gateway | CLI 0.43.3 | Help confirms streaming transport; no gateway started or servers enabled; browser interoperability pending |
| Ollama / LM Studio | LM Studio proxy smoke-tested; exact runtime version not supplied | Ollama remains pending; do not infer the upstream runtime from the local proxy name |
| Edge / Firefox / Safari | Not qualified | Cross-browser release gates pending |
| WebLLM | 0.2.83 | Existing adapter, separate live qualification pending; no agent support |

## Reproduce deterministic checks

```sh
pnpm test
pnpm typecheck
pnpm eval
pnpm build
pnpm test:browser
```

The browser runner currently uses installed Chrome and starts a local preview
on `127.0.0.1:4322`. Fixture requests are intercepted; this checks application
behavior and production CSP, not real-server CORS or endpoint availability.
The static build retains large-bundle warnings (especially WebLLM); they are not
runtime qualification results.

Record exact model/runtime versions and three-run answer/citation rubric scores
before promoting v1. An SDK supporting a protocol version is not evidence that
every server/model combination has passed interoperability tests.

The first [reference-model evaluation](v1-live-evaluation.md) completed 90 answer
runs: document evidence 45/45, absence handling 15/15, research review RAG 9/15
versus Agent 12/15. Exact runtime and the remaining compatibility gates are still
pending; this is not a release approval.
