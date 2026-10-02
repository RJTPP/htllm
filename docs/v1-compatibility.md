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
| Reference HTTP model | `qwen3.6-35b-a3b` via user-managed LiteLLM | Endpoint reachability only (401 without credentials); tool/model quality and CORS pending |
| Docker MCP Gateway | CLI 0.43.3 | Help confirms streaming transport; no gateway started or servers enabled; browser interoperability pending |
| Ollama / LM Studio | No running endpoint qualified | Live model and runtime versions pending |
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
