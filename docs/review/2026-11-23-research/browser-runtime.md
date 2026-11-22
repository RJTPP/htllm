# Browser building blocks for the htllm Workspace

Research date: 2026-11-23. This was read-only research. Nothing was installed or run in a browser.

**What the evidence is.** Every "eval / `new Function` found" verdict below comes from grepping the published npm bundle as served by jsDelivr. These are static checks, not runtime tests. "No eval sites found" means the string patterns `new Function`, `Function(` and `eval(` do not appear in the shipped file. It does not prove the code works under the CSP. Anything that depends on runtime behaviour is marked **UNVERIFIED**.

---

## 0. CSP facts that decide everything

Production CSP (from `src/layouts/BaseLayout.astro:17-18`, delivered only through `<meta>`):

```
default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; img-src 'self' data: blob:; worker-src 'self' blob:
```

The dev CSP (`BaseLayout.astro:20`) adds `'unsafe-inline' 'unsafe-eval'`. **Anything that uses `new Function` will work in `pnpm dev` and break in production.** Every candidate below therefore has to be tested against `pnpm build && pnpm preview`.

### 0.1 Which policy a worker gets (the headline finding)

| Worker created from | Policy it runs under | Spec / source |
|---|---|---|
| `blob:` URL | A **clone of the policy of the environment that created the blob URL**. On the main page that is the page's meta CSP: no eval, wasm allowed, `connect-src https:` | HTML spec, [creating a policy container from a fetch response](https://html.spec.whatwg.org/multipage/browsers.html#creating-a-policy-container-from-a-fetch-response): "If response's URL's scheme is "blob", then return a clone of response's URL's blob URL entry's environment's policy container." |
| `data:` URL | A clone of the owner's policy container | HTML spec, [initialize a worker global scope's policy container](https://html.spec.whatwg.org/multipage/browsers.html#initialize-worker-policy-container), step 1 |
| Same-origin script URL, e.g. `new Worker(new URL('./x.ts', import.meta.url))` as in `src/providers/webllm/index.ts:77` | **Only the CSP response headers of the worker script.** A `<meta>` CSP never reaches it. On a static host that sends no CSP header, this worker has **no CSP at all**: `eval` is not blocked and `fetch` can reach any host. Mixed-content blocking still stops `http:` on an HTTPS deploy | Same algorithm, "Otherwise" branch. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy): workers are "in general, not governed by the content security policy of the document … that created them"; "To specify a content security policy for the worker, set a Content-Security-Policy response header" |

Browser conformance:
- **Chromium** switched URL-loaded dedicated workers to response-header CSP, keeping inheritance for local schemes, in the commit [[CSP] Fix dedicated worker inheritance](https://chromium.googlesource.com/chromium/src/+/f7c475b89dc0281b63133497efefa6b6cc007c64) (2021-10-14). Before that, Chrome inherited from the creating document.
- **Firefox:** [bug 1800890](https://bugzilla.mozilla.org/show_bug.cgi?id=1800890) (CVE-2023-23602) was a `connect-src` bypass for WebSockets opened from workers, fixed in Firefox 109. [Bug 1626566](https://bugzilla.mozilla.org/show_bug.cgi?id=1626566), "Blob URLs do not inherit CSP from originating page", is still **NEW**. It is about navigations, but whether Firefox's blob **worker** inherits the creator's policy is **UNVERIFIED**.
- **Safari:** **UNVERIFIED**. WebKit discussed CSP for dedicated workers in a [2021 request for position](https://lists.webkit.org/pipermail/webkit-dev/2021-October/031999.html).

What follows from this:
1. **No worker can be given a stricter CSP than the page through `<meta>`.** Workers have no document. A worker gets a stricter policy only in two ways:
   - its script's HTTP response carries a CSP header, which needs host support such as `_headers`; or
   - it is a `blob:` worker minted by a document that has a stricter policy, such as a same-origin iframe page with its own meta CSP (see §5).
2. **A same-origin URL worker is an unprotected hole, not a workaround.** It escapes the `new Function` ban, but it also escapes `connect-src`. Never use one to run model-generated code, and never use one to dodge the eval blockers in AlaSQL, Arquero or DuckDB.
3. Side note, out of scope: the existing WebLLM worker is a same-origin URL worker. On a host without CSP headers it runs with no CSP. Today it only runs trusted code.
4. CSP3 enforces every policy at once. A meta policy "will be enforced along with any other policies active for the protected resource" ([CSP3 §3.3](https://www.w3.org/TR/CSP3/)), and a violation of any enforced policy blocks the action. So adding a policy can only tighten.
5. `connect-src` covers `fetch()`, XHR, EventSource, Beacon, `<a ping>` and WebSocket ([CSP3 §6.1.2](https://www.w3.org/TR/CSP3/#directive-connect-src)). WebRTC falls under a separate `webrtc` directive ([§6.2.1](https://www.w3.org/TR/CSP3/#directive-webrtc)). Browser support for that directive is **UNVERIFIED**. `RTCPeerConnection` is not exposed in workers (**UNVERIFIED** for every engine).
6. `'wasm-unsafe-eval'` permits WebAssembly compilation and nothing else ([CSP3 §4.5.1](https://www.w3.org/TR/CSP3/)). Emscripten glue that calls `eval()` for `EM_ASM`/`EM_JS` in dynamically linked side modules is still blocked.

---

## 1. Virtual filesystem layer

| Option | Version (npm latest) | License | Size | Maintenance | Fit for htllm |
|---|---|---|---|---|---|
| **Own model over IndexedDB** (`src/data/workspace.ts`) | n/a | n/a | ~0 (reuses `idb@8.0.2`) | ours | **Best fit.** Paths become records keyed `(threadId, path)`. Documents already hold their extracted text, so knowledge libraries can be mounted read-only as *virtual* entries without copying. Export and reset fit the existing `src/data/` patterns. |
| [ZenFS](https://github.com/zen-fs/core) `@zenfs/core` + `@zenfs/dom` | 2.9.0 (2026-11-04) / 1.2.14 | **LGPL-3.0-or-later** ([npm](https://registry.npmjs.org/@zenfs/core/latest)) | 1.27 MB unpacked core | Active (pushed 2026-11-21, 431★) | Emulates the whole Node `fs` API with IndexedDB and OPFS backends ([README](https://github.com/zen-fs/core)). Far more than we need. **LGPL bundled into a static JS app carries relinking obligations** (the README points to COPYING.md for bundling terms), so it needs legal review. Skip. |
| [memfs](https://github.com/streamich/memfs) | 4.80.1 (2026-11-12) | Apache-2.0 | 74 KB unpacked, plus 14 deps | Active | In-memory Node `fs` plus an FSA shim ([README](https://cdn.jsdelivr.net/npm/memfs@4.80.1/README.md)). It does not persist anything, and whether it needs a Buffer polyfill in the browser is **UNVERIFIED**. Only useful for tests. Skip. |
| [lightning-fs](https://github.com/isomorphic-git/lightning-fs) `@isomorphic-git/lightning-fs` | 4.10.5 (2026-10-31) | MIT | 117 KB unpacked | Active-ish (616★) | Backed by IndexedDB. Keeps a superblock in memory and flushes it on a 500 ms debounce. "Only 'utf8' encoding is supported", `readdir` is "NOT SORTED", and a cross-tab mutex can wait "ten minutes" ([README](https://cdn.jsdelivr.net/npm/@isomorphic-git/lightning-fs@4.10.5/README.md)). Built for isomorphic-git. It would be a second IndexedDB database beside ours. Skip. |
| **OPFS** (`navigator.storage.getDirectory()`) | platform | n/a | 0 | Baseline since March 2023 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)) | Async API on the main thread; sync access handles only in workers. Same quota as IndexedDB, and it is cleared when site data is cleared. It is a second store, so export, reset and storage stats would have to cover two systems. Its edge is large binary files, but our files are text. Skip for now. Reconsider only if large binary artefacts arrive. |

**Verdict:** write our own. About 200 lines in `src/data/workspace.ts`:
- `WorkspaceEntry {threadId, path, kind: 'file'|'dir', source: 'user'|'model'|'doc', docId?, content?, size, mtime}`
- a `by-thread` index
- `list/read/write/rm/mv/stat`

Read-only mounts such as `/docs/<name>.txt` and `/library/<lib>/<doc>.txt` resolve lazily to `documents.ts` text. Nothing is duplicated.

If just-bash (§2) is adopted, its `IFileSystem` is **async for I/O but has sync `resolvePath(base, path)` and `getAllPaths(): string[]`** ([interface.d.ts@3.6.1](https://cdn.jsdelivr.net/npm/just-bash@3.6.1/dist/fs/interface.d.ts)). An IndexedDB adapter therefore needs an in-memory path index. That is cheap, since a per-chat workspace has hundreds of entries at most. Alternatively, hand just-bash an `InMemoryFs` that uses its lazy file entries ("lazy file content functions that run on first read", per the [README](https://cdn.jsdelivr.net/npm/just-bash@3.6.1/README.md)) for read-only documents, then persist the diff of writable paths after each `exec`.

---

## 2. Shell / bash emulation for agents

### 2.1 vercel-labs/just-bash: confirmed

- **Repo:** [github.com/vercel-labs/just-bash](https://github.com/vercel-labs/just-bash). About "Bash for Agents", 4.5k★, last push 2026-11-20. Tags are per-package, e.g. [`just-bash@3.6.1`](https://github.com/vercel-labs/just-bash/tree/just-bash%403.6.1).
- **npm:** `just-bash@3.6.1`, published 2026-11-16 ([registry](https://registry.npmjs.org/just-bash/latest)). Apache-2.0 per npm. The LICENSE file sits in `packages/just-bash/`, and the GitHub API reports no root licence. Weekly downloads are about 3.97 M ([npm API](https://api.npmjs.org/downloads/point/last-week/just-bash)).
- **Maturity:** the README says "This is beta software. Use at your own risk." It has gone through three majors since 2025-12-27. Pin an exact version (repo rule), and expect churn.
- **Companion:** [vercel-labs/bash-tool](https://github.com/vercel-labs/bash-tool) (MIT, 1.3.19) wraps just-bash as AI SDK tools. We don't use the AI SDK, so skip it.

**Command coverage** ([README@3.6.1](https://cdn.jsdelivr.net/npm/just-bash@3.6.1/README.md)):
- **Files:** cat, cp, file, ln, ls, mkdir, mktemp, mv, readlink, rm, rmdir, split, stat, touch, tree
- **Text:** awk, base64, column, comm, cut, diff, expand, fold, grep/egrep/fgrep, head, join, md5sum, nl, od, paste, printf, rev, rg, sed, sha*sum, sort, strings, tac, tail, tr, unexpand, uniq, wc, xargs
- **Data:** jq, yq, xan (CSV), sqlite3
- **Shell:** pipes, redirections, functions, loops, find, tee, seq, date, expr, …
- **Optional:** curl, html-to-markdown, python3, js-exec

**Browser entry** (`just-bash/browser`, [browser.d.ts](https://cdn.jsdelivr.net/npm/just-bash@3.6.1/dist/browser.d.ts)):
- Exports `Bash`, `InMemoryFs`, `MountableFs`, `defineCommand`, `getCommandNames`.
- Excludes OverlayFs, ReadWriteFs and Sandbox. "gzip/gunzip/zcat … will fail at runtime in browsers."
- The README says python3, sqlite3 and js-exec are unavailable in browsers. The bundle confirms it with the error "command not available in browser environments".
- Everything else (grep, rg, sed, awk, jq, yq, xan, find, wc, head, diff, tar) is present in the bundle.

**Bundle size** (computed from jsDelivr):
- `dist/bundle/browser.js` is **1,264,594 B minified, 354,299 B gzip -9**. It is one self-contained ESM file with no top-level imports.
- It bundles re2js, papaparse, yaml, fast-xml-parser, turndown, diff and smol-toml.
- It should be lazy-loaded when Workspace mode turns on.

**CSP:**
- 0 occurrences of `new Function` or `Function(` in `browser.js`.
- The single `eval(` hit is a string inside its own violation table.
- `WebAssembly` is referenced 3 times. One is in the defense-in-depth violation list; the other two were counted but not inspected.
- Regex runs on **re2js** (linear time). The [threat model](https://github.com/vercel-labs/just-bash/blob/just-bash%403.6.1/THREAT_MODEL.md) cites it as the ReDoS mitigation.
- Static verdict: **no eval sites found**, so it should run on the page or in a blob worker under the current CSP. Runtime behaviour is **UNVERIFIED**.

**Security model** ([THREAT_MODEL.md@3.6.1](https://github.com/vercel-labs/just-bash/blob/just-bash%403.6.1/THREAT_MODEL.md)):
- "The primary defense is that no code path exists from bash interpretation to JavaScript execution."
- Network is off by default: curl is registered only when `network` is configured, with `allowedUrlPrefixes` and per-redirect checks. In the bundle, the fetch path is `(n ?? globalThis.fetch)` gated by `secureFetch`.
- Limits include `maxLoopIterations` (10K), `maxCallDepth` (100), `maxCommandCount` (10K), `maxOutputSize`, `maxFileSystemBytes` and `maxExecutionTimeMs`. `exec()` accepts an `AbortSignal`, and the `commands?: CommandName[]` allow-list option is in [Bash.d.ts](https://cdn.jsdelivr.net/npm/just-bash@3.6.1/dist/Bash.d.ts).
- "just-bash protects untrusted *scripts*, not untrusted *hosts*": `fs`, `fetch` and `customCommands` are trusted.
- **Defense-in-depth global patching is a no-op in the browser bundle.** The bundle sets `Tr=!0`. With `Tr` true, `activate()` returns a pass-through handle without calling `applyPatches()`, and `AsyncLocalStorage` is stubbed to `void 0`. So it will **not** monkey-patch `setTimeout`, `Proxy` or `WebAssembly` on a thread shared with React or WebLLM. Browser isolation is purely architectural.
- Runaway work is bounded only by counters, so put it in a worker anyway: `terminate()` is the only hard stop.

**Extensibility:**
- `defineCommand` via `customCommands` or `bash.registerCommand()` (exact signature **UNVERIFIED**). A custom `calc` or `csvq` command could be added this way.
- Any `IFileSystem` can be plugged in, and `MountableFs` mounts several, e.g. read-only `/docs` plus writable `/work`.

### 2.2 Alternatives found

| Project | Status | Notes |
|---|---|---|
| [rust-bash](https://github.com/shantanugoel/rust-bash) (npm `rust-bash`) | 0.7.0, last publish 2026-04-05, MIT, 43 MB unpacked, **8 downloads/week** | Rust to WASM, claims 80 commands ([docs.rs](https://docs.rs/crate/rust-bash/0.3.0)). Dormant, so skip. |
| tinysandbox, vbash | Rust crates, no npm browser package found | Skip. |
| @wasmer/sdk (real bash on WASIX) | 0.19.1, licence "SEE LICENSE IN LICENSE" | Needs `SharedArrayBuffer`, i.e. COOP/COEP headers that `<meta>` cannot deliver (**UNVERIFIED** for current version). Skip. |
| WebContainers | Commercial licensing and a COOP/COEP requirement (both from recall, **UNVERIFIED**) | Skip: a third-party runtime, ruled out by the brief. |

### 2.3 Do we need bash at all?

The brief says "not a runtime environment". Five typed tools already cover the core loop:
- `ws_list(path, recursive?)`
- `ws_read(path, offset?, limit?)`
- `ws_grep(pattern, path?, ignoreCase?)`
- `ws_write(path, content)`
- `ws_stat`

These are about 300 lines of our own code. Small local models likely handle a few typed tools better than free-form shell. That is a judgement call, **UNVERIFIED** here; the existing `eval/` harness could test it. just-bash pays off only if we want composability (`grep | sort | uniq -c`, `jq`, `awk`, `xan`) for capable remote models. Treat it as an optional second tier behind a setting, loaded lazily.

---

## 3. Code functions

For each runtime: which CSP context it runs under, whether it works, and whether it can exfiltrate.

| Runtime | Page (meta CSP) | Blob worker (inherits page CSP) | Same-origin URL worker (no CSP unless headers) | Network from guest code |
|---|---|---|---|---|
| **QuickJS** (quickjs-emscripten) | No eval sites found in glue; wasm allowed | Same | Works, but unnecessary | **None by construction.** "By default, no host functionality is exposed to code running inside QuickJS" ([README@0.32.0](https://cdn.jsdelivr.net/npm/quickjs-emscripten@0.32.0/README.md)). The guest reaches only the host functions we create with `vm.newFunction`. |
| **Pyodide** | Core: no `new Function`; 6 `eval(` sites in the EM_ASM/EM_JS dynamic-link path and `emscripten_run_script` | Same as page. Whether core boot avoids those paths is **UNVERIFIED**. [Pyodide PR #3075](https://github.com/pyodide/pyodide/pull/3075) fixed PyProxy creation without `unsafe-eval` in 2022. Packages with EM_ASM are **UNVERIFIED** | eval not blocked (**no CSP**); runtime **UNVERIFIED** | **Full.** `from js import fetch` and `pyodide.http` reach the worker's `fetch`. In a blob worker on our page that means any `https:` host. |
| **Plain JS in a blob worker** | n/a | Guest `eval`/`new Function` blocked. **The guest code itself is the payload**, so it calls `fetch('https://…')` directly, which `connect-src https:` allows | **No CSP: anything goes** | **Full.** Deleting `self.fetch` etc. is a deny-list. Nested `new Worker(blob)` and `importScripts` give fresh globals, so it is bypassable. |
| `run` (vercel-labs, QuickJS) | n/a | n/a | n/a | Node/Bun only ("Node.js 20.19+ and Bun", [README](https://cdn.jsdelivr.net/npm/run@2.1.13/README.md)). Not for the browser. |
| `@sebastianwessel/quickjs` 3.1.0 | **UNVERIFIED** | **UNVERIFIED** | n/a | Has an `allowFetch` option whose default is **UNVERIFIED**; browser support is not stated ([README](https://cdn.jsdelivr.net/npm/@sebastianwessel/quickjs@3.1.0/README.md)). The TypeScript support implies bundling a TS compiler. Skip. Use quickjs-emscripten-core directly. |

### 3.1 QuickJS details (quickjs-emscripten 0.32.0, 2026-02-16, MIT)

- **Packages:** use `quickjs-emscripten-core` together with one variant, `@jitl/quickjs-wasmfile-release-sync` or `@jitl/quickjs-ng-wasmfile-release-sync`. The README states "1.3mb total", against 9.04 MB for the all-variants `quickjs-emscripten`.
- **Measured sizes:**
  - `emscripten-module.wasm`: **503,134 B** (quickjs), **231,494 B gzip**. The quickjs-ng variant is 528,551 B.
  - Browser glue `emscripten-module.browser.mjs`: 9.4 KB, with **0 `eval`/`new Function` sites**.
- **Self-hosting:** the wasm loads via the `new URL('./…', import.meta.url)` pattern, which Vite/Astro emits into `dist/`. You can also pass the module yourself through `newVariant(…, {wasmModule})` ([README](https://cdn.jsdelivr.net/npm/quickjs-emscripten@0.32.0/README.md)). Fetching that wasm is a same-origin request, allowed by `connect-src 'self'`.
- **Limits:**
  - `runtime.setMemoryLimit(bytes)`
  - `runtime.setMaxStackSize(bytes)`
  - `shouldInterruptAfterDeadline(Date.now()+ms)` / `runtime.setInterruptHandler`
  - The interrupt is cooperative, polled by the VM, so it needs no SharedArrayBuffer.
  - Hard stop: `worker.terminate()`.
- **Sync vs async:** the asyncify variant is "1M, 2x larger than the 500K" and slower. Use the sync variant.
- **Files in and out:** post a snapshot (`Record<path, string>`) into the worker, then expose sync host functions `fs.read(path)`, `fs.write(path, text)` and `fs.list(dir)` over that map. Return `{stdout, result, writes}` and apply `writes` to the workspace through `src/data/`. No host function touches network or IndexedDB.
- **Cold start:** **UNVERIFIED**. No figure found in the docs; measure it.
- **Audit status:** "has not been audited", "use with care in production settings", and the API is pre-1.0.

### 3.2 Pyodide (314.0.8, 2026-11-13, MPL-2.0)

- **Size:**
  - `pyodide.asm.wasm` 9,597,892 B
  - `python_stdlib.zip` 2,545,550 B
  - `pyodide.asm.mjs` 1,250,259 B
  - About 13.4 MB uncompressed before any package ([jsDelivr listing](https://cdn.jsdelivr.net/npm/pyodide@314.0.8/)).
- **Self-hosting:** possible. `indexURL` defaults to the directory Pyodide was loaded from, and `lockFileURL` to `${indexURL}/pyodide-lock.json` ([JS API](https://pyodide.org/en/stable/usage/api/js-api.html)). `checkIntegrity` is on by default.
- **Interrupt:** needs `setInterruptBuffer` with a **SharedArrayBuffer**, and "your server must set appropriate security headers" ([docs](https://pyodide.org/en/stable/usage/keyboard-interrupts.html)), i.e. COOP/COEP. `<meta>` cannot deliver those. On our hosting the only stop is `terminate()`, followed by a ~13 MB cold reload.
- **Exfiltration:** Python has direct `js` and `fetch` access, so it needs a strict-CSP container (§5) before it is safe.
- **Cold start:** **UNVERIFIED**.
- **Memory limit:** no documented per-run cap found. The wasm heap grows until `terminate()` (**UNVERIFIED**).
- **Files in and out:** through `pyodide.FS` (Emscripten MEMFS) via `FS.writeFile`/`FS.readFile`, fed by postMessage (from the Pyodide API, not re-checked here).
- **Verdict:** skip for Phase 1.

### 3.3 Plain JS in a blob worker

- **Limits:** none inside the worker, beyond the browser's own. The only control is an outer timer plus `terminate()`.
- **Files in and out:** postMessage, the same as QuickJS.
- **Exfiltration:** inherits `connect-src https:` (§5.2). Not acceptable for model-written code.

---

## 4. Data query helpers

All values are for the npm `latest` dist-tag, grepped on jsDelivr.

| Library | Version / License | Size (min / gzip) | eval sites (static) | CSP verdict under our policy | Notes |
|---|---|---|---|---|---|
| **papaparse** | 5.7.1 / MIT | 19,012 B / 6,855 B | none found | Should work (page or blob worker) | CSV to rows. Already bundled inside just-bash. |
| **just-bash `jq` / `xan` / `awk`** | (part of just-bash) | included in the 354 KB gz | none found | Should work | Pure-TS jq (`dist/commands/query-engine/`). No extra dependency if just-bash is adopted. |
| **sql.js** | 1.17.0 / MIT | glue 62,144 B / 21,679 B, plus `sql-wasm-browser.wasm` 688,280 B | none found in glue | Should work (wasm allowed) | SQLite has no network. Good for "SQL over a CSV" in a worker. Optional. |
| **jq-wasm** (owenthereal) | 3.0.0-jq-1.8.2 / MIT | 128,843 B JS + 928,824 B wasm (330,958 B gzip) | none found | Should work | Real jq 1.8.2. Redundant if just-bash is adopted. |
| **jq-web** (fiatjaf) | 0.6.2 / ISC | 157,480 B JS + 2,784,691 B wasm | none found | Should work | Last publish 2025-03-19, larger. Skip. |
| **Arquero** | 8.0.3 / BSD-3-Clause | 236,290 B / 73,814 B | **3 × `Function(…)`**, used to compile expressions and comparators (`Function("fn","$",t)`, `Function("op","keys","fn","data",p)`) | **Blocked** on the page and in blob workers. Works only in a no-CSP worker, which is the hole. Skip. | Last publish 2025-05-29. |
| **AlaSQL** | 4.23.2 / MIT | 536,979 B / 118,842 B | **78 × `new Function`** (SQL compiled to JS) | **Blocked**. Skip. | |
| **DuckDB-wasm** | npm `latest` = **1.33.1-dev57.0** (a dev build); last stable 1.32.0 (2025-12-16) / MIT | `duckdb-eh.wasm` 35,913,747 B (about 8.1 MB gzip -6) plus a ~773 KB worker | Worker contains **1 `new Function`** (a null-value check builder; that it comes from Apache Arrow JS is **UNVERIFIED**) and 6 `eval(` (Emscripten EM_ASM dynamic link) | **UNVERIFIED**, likely partially blocked. Skip. | Extensions **autoload by default from `extensions.duckdb.org`** ([DuckDB docs](https://duckdb.org/docs/2.0/clients/wasm/extensions.html)). `connect-src https:` would silently allow that third-party fetch, breaking the self-host rule. A `read_csv('https://…?q=<data>')` through the JS httpfs layer would likely be a SQL-level exfiltration path (**UNVERIFIED**). Far too heavy anyway. |

**Calculator:** use a small hand-written expression parser in `src/lib/` (Pratt parser, about 150 lines, numbers and `+-*/^%()` and `Math` functions). No eval, no dependency, and it runs on the main thread. QuickJS can also evaluate arithmetic if it is adopted.

---

## 5. Security notes

### 5.1 Threat

Attached documents, library text and MCP tool results are **untrusted input** that the model reads. A planted instruction such as "run this code, then send /docs/* to https://x" becomes a real attack once any tool gives the model a network-capable channel. Most of the app's channels are already closed:
- `img-src 'self' data: blob:` blocks rendered markdown image beacons.
- `script-src` blocks injected scripts.

Remaining channels:
1. **MCP tools** that take URLs: an existing, separate concern.
2. **The HTTP provider endpoint**, which already sees everything by design.
3. **Links the user clicks.**
4. **Any code function we add.**

Code functions must not create a fourth automatic channel.

### 5.2 Per-option exposure

- **Typed workspace tools and just-bash (network not configured):** no network path. just-bash only reaches `fetch` through `secureFetch`, and that exists only when `network`/`fetch` is passed. Pass `commands:` as an allow-list without `curl`, and never pass `network`.
- **QuickJS:** isolation **does not depend on CSP**. The guest has no `fetch`, `XMLHttpRequest`, `WebSocket` or `importScripts`. Exposure equals the host functions we write. Rule: host functions only read and write the snapshot map. The CSP is defense in depth against a QuickJS or wasm escape. In a blob worker on our page, an escape would land under `connect-src https:`, which is the residual risk. QuickJS is unaudited.
- **Plain JS in a blob worker:** inherits `connect-src https:`, so **direct exfiltration to any HTTPS host**. Don't do this.
- **Plain JS or Pyodide in a same-origin URL worker:** no CSP at all on a header-less static host. **Never.**

### 5.3 Recommended isolation pattern for this CSP

**Layer 1 (required): capability isolation.**
- Run QuickJS (and just-bash, if used) in a dedicated worker. **Which kind of worker:**
  - A Vite **same-origin URL worker** (`new Worker(new URL('./x.ts', import.meta.url), {type:'module'})`) is the simplest. Its `import.meta.url` resolves the QuickJS wasm, so bundling just works. It runs with **no CSP** on a header-less host.
  - A **blob worker** inherits the page policy (`connect-src https:`). Its code and wasm must be fetched by the parent and passed in, because `import.meta.url` is a `blob:` URL there.
  - **On the main page, neither kind contains a QuickJS escape.** One has no policy, the other allows any HTTPS host. Layer 1 rests entirely on QuickJS having no network globals. Only Layer 2 or Layer 3 adds a CSP backstop.
  - Recommendation: a same-origin URL worker for Layer 1. Move to Layer 2 if hardening is needed.
- The guest sees only `fs.read`/`fs.write`/`fs.list` over an in-memory snapshot, plus `console.log`.
- Apply limits: `setMemoryLimit` (e.g. 64 MB), `setMaxStackSize`, a deadline interrupt (e.g. 5 s), and an outer `setTimeout` that calls `terminate()`.
- Writes come back as data. The main thread validates them (path prefix `/work/`, size caps) and persists them through `src/data/`.
- Execution needs a per-call user approval toggle, like the existing MCP tool approval, when the chat contains untrusted documents.

**Layer 2 (optional hardening): a stricter CSP container.**
- **How it gets a stricter policy:** CSP policies stack and cannot be loosened (§0.1, point 4), and a blob worker inherits the policy of the document that minted the blob URL. So a stricter context is possible without server headers.
- **The page:** ship a hand-written same-origin page, `public/sandbox/runner.html`.
  - Its first `<head>` child is a meta CSP: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src blob:`. With no `connect-src`, it falls back to `default-src 'none'`.
  - It is not reached by the app's meta CSP: it is navigated by URL, so it gets only its own response and meta policy.
- **Embedding:** embed it as `<iframe sandbox="allow-scripts" src="/sandbox/runner.html">` with no `allow-same-origin`. The frame gets an opaque origin, so it cannot read the app's IndexedDB or DOM. The parent CSP allows the frame because `frame-src` falls back to `default-src 'self'`.
- **Inside the frame:**
  - Mint a `blob:` worker. It inherits `connect-src 'none'`.
  - The parent transfers the QuickJS wasm **bytes** via `postMessage`, because the frame cannot fetch.
  - Files go in and come out over `MessageChannel`.
- **Open checks:**
  - Whether `'self'` in the frame's `script-src` matches when the document has an opaque (sandboxed) origin is **UNVERIFIED**. CSP3 introduced a policy "self-origin" for such cases ([§2.2](https://www.w3.org/TR/CSP3/)). Fallback: a `'sha256-…'` hash source for an inline bootstrap.
  - Firefox's blob-worker inheritance is **UNVERIFIED** (§0.1).
  - Whether an opaque-origin (sandboxed, no `allow-same-origin`) frame can create a `blob:` URL and start a worker from it is **UNVERIFIED**.
  - Test both in Chrome, Firefox and Safari before relying on this layer.
- **When it is needed:** the only way to make Pyodide or raw JS safe. With QuickJS it is optional defense in depth.

**Layer 3 (optional, host-dependent):** if the deploy host supports response headers (e.g. a `_headers` file), send `Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'` **for the code-runner worker script path only**. That same-origin URL worker then gets a strict policy directly. If the runner fetches its own wasm, add `connect-src 'self'`.

The WebLLM worker needs a **separate** header mirroring the page policy, including `connect-src https:`. It fetches model weights, so a `default-src 'none'` policy would break it. Hashed Vite chunk names make per-path headers awkward. Not available on every static host.

---

## Recommendation

Ordered by value to effort. Pin exact versions (repo rule).

1. **Adopt: our own workspace store in `src/data/workspace.ts`, plus typed tools (`ws_list/read/grep/write/stat`).** No dependency or CSP risk. Mounts the document text we already have read-only, and small local models handle typed tools best.
2. **Adopt: papaparse 5.7.1 (6.9 KB gz, MIT) for CSV parsing into tables, plus a hand-written arithmetic parser for `calc`.** Tiny, no eval sites found, covers "calculator" and "CSV to table" without any runtime.
3. **Optional tier: just-bash `3.6.1` browser bundle (354 KB gz, Apache-2.0, beta) in a worker.**
   - Use an `InMemoryFs`/`MountableFs` hydrated from the workspace, a `commands` allow-list, no `network`, and limits on.
   - It brings grep, rg, sed, awk, jq, xan and find with no eval sites and no global patching in the browser.
   - Beta, with fast major churn. Lazy-load it, and gate it behind a setting for capable models.
4. **Optional tier: QuickJS via `quickjs-emscripten-core` 0.32.0 + `@jitl/quickjs-wasmfile-release-sync` 0.32.0 (~231 KB gz wasm, MIT) in a worker.** Only for "tiny scripts":
   - snapshot in, writes out
   - memory, stack and deadline limits, plus `terminate()`
   - user approval per run.
   - Its isolation holds without the CSP. Add the §5.3 Layer 2 iframe hardening later if scripts touch sensitive libraries.
5. **Maybe later: sql.js 1.17.0 (~690 KB wasm, MIT)** if users want SQL over CSV. No eval sites found, and no network.
6. **Skip:**
   - **ZenFS:** LGPL, over-scoped.
   - **memfs:** in-memory only.
   - **lightning-fs:** second DB, utf8-only.
   - **OPFS:** second store, not needed for text.
   - **Pyodide:** ~13 MB, eval paths, no interrupt without COOP/COEP, raw `fetch` access.
   - **Plain JS in blob or URL workers:** direct exfiltration through `connect-src https:`, or no CSP at all.
   - **Arquero and AlaSQL:** `Function`/`new Function`, blocked in prod but working in dev.
   - **DuckDB-wasm:** 36 MB, `latest` is a dev tag, third-party extension autoload, SQL-level `https` reads.
   - **jq-web:** redundant.
   - **rust-bash, @wasmer/sdk, WebContainers:** dormant, or need COOP/COEP.
