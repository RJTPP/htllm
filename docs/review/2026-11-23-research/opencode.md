# OpenCode file-tool design — research notes (2026-11-23)

## 0. Which repo, which version

- **Canonical repo: [`anomalyco/opencode`](https://github.com/anomalyco/opencode)** ("The open source coding agent.", TypeScript, default branch `dev`). `api.github.com/repos/sst/opencode` returns **301 → repository id 975734319**, which resolves to `anomalyco/opencode`; i.e. the well-known `sst/opencode` was moved/renamed to `anomalyco`. Verified via GitHub API on 2026-11-22/23.
- **Not used:** `opencode-ai/opencode` (Go, "A powerful AI coding agent. Built for the terminal.") is **archived** (API `archived: true`); it is the older, unrelated-lineage project that became Charm's Crush. Various other `*/opencode` repos are forks.
- **Version read: release tag `v1.19.6` (published 2026-11-17) = commit [`f4e363c8295fa90a03dddc451882fffe8fbce357`](https://github.com/anomalyco/opencode/tree/f4e363c8295fa90a03dddc451882fffe8fbce357).** All links below are pinned to that SHA unless marked historical. Source tarball read locally; nothing executed.
- Shorthand: `B` = `https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357`. Main package: `packages/opencode/src/`.

---

## 1. Tool list and schemas

Built-in registry ([registry.ts#L231](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/registry.ts#L231)): `invalid`, `question` (app/cli/desktop only), `bash`, `read`, `glob`, `grep`, `edit`, `write`, `task`, `webfetch`, `todowrite`, `websearch` (provider-gated), `skill`, `apply_patch`, optional `execute` (code mode), `lsp`, `plan_exit` (flags).

Links: [registry.ts](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/registry.ts#L231-L249), shell id is still `"bash"` for compatibility ([shell/id.ts#L16](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/shell/id.ts#L16)).

**No `list`/`ls` tool and no `multiedit` any more.**
- `ls`/`list` was removed in April 2026 — commit [`d2ea6700aa`](https://github.com/anomalyco/opencode/commit/d2ea6700aa2e6bdf5d04fe70ba893afbb320adbd) "Remove dead code and documentation related to the obsolete list tool". Directory listing is now folded into **`read`** (pass a directory path). Historical `ls` (at [`d6840868d4`](https://github.com/anomalyco/opencode/blob/d6840868d4/packages/opencode/src/tool/ls.ts)) had `path`, `ignore: string[]`, `LIMIT = 100`, hard-coded `IGNORE_PATTERNS`, tree render.
- `multiedit.ts` deleted in [`2486621ca1`](https://github.com/anomalyco/opencode/commit/2486621ca1) "chore: kill unused tool" (2026-04-21).
- The docs page [tools.mdx](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/web/src/content/docs/tools.mdx) lists bash, edit, write, read, grep, glob, lsp, apply_patch, skill, todowrite, webfetch, websearch, question — consistent with source.

### read — [read.ts#L28](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L28), [read.txt](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.txt)
```ts
filePath: string  // "The absolute path to the file or directory to read"
offset?: NonNegativeInt  // "The line number to start reading from (1-indexed)"
limit?:  NonNegativeInt  // "The maximum number of lines to read (defaults to 2000)"
```
Description highlights (read.txt): "Read a file or directory…"; "By default, this tool returns up to 2000 lines"; "Use the grep tool to find specific content in large files or files with long lines"; "If you are unsure of the correct file path, use the glob tool"; prefix format `<line>: <content>`; directories "one per line (without line numbers) with a trailing `/`"; "Any line longer than 2000 characters is truncated"; "Call this tool in parallel…"; **"Avoid tiny repeated slices (30 line chunks). If you need more context, read a larger window."**; "can read image files and PDFs and return them as file attachments."

### glob — [glob.ts#L10](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/glob.ts#L10-L16), [glob.txt](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/glob.txt)
```ts
pattern: string  // "The glob pattern to match files against"
path?: string    // "...IMPORTANT: Omit this field to use the default directory. DO NOT enter \"undefined\" or \"null\" - simply omit it..."
```
Note the anti-weak-model phrasing in `path` ("DO NOT enter undefined/null").

### grep — [grep.ts#L10](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/grep.ts#L10-L18), [grep.txt](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/grep.txt)
```ts
pattern: string   // "The regex pattern to search for in file contents"
path?: string     // "The directory to search in. Defaults to the current working directory."
include?: string  // 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'
```
No case-insensitive flag, no context-lines option, no output-mode option (contrast Claude Code's Grep). Description tells the model to use `rg` via Bash for counting.

### edit — [edit.ts#L47](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L47-L56), [edit.txt](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.txt)
```ts
filePath: string     // "The absolute path to the file to modify"
oldString: string    // "The text to replace"
newString: string    // "The text to replace it with (must be different from oldString)"
replaceAll?: boolean // "Replace all occurrences of oldString (default false)"
```
edit.txt explicitly teaches stripping the read prefix: "The line number prefix format is: line number + colon + space (e.g., `1: `)… Never include any part of the line number prefix in the oldString or newString."

### write — [write.ts#L20](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/write.ts#L20-L25), [write.txt](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/write.txt)
```ts
content: string   // "The content to write to the file"
filePath: string  // "The absolute path to the file to write (must be absolute, not relative)"
```

### apply_patch — [apply_patch.ts#L18](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/apply_patch.ts#L18-L20), [apply_patch.txt](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/apply_patch.txt)
```ts
patchText: string // "The full patch text that describes all changes to be made"
```
Codex-style envelope `*** Begin Patch` / `*** Add File:` / `*** Update File:` / `*** Move to:` / `*** Delete File:` / `@@` hunks / `*** End Patch`. **Mutually exclusive with edit/write, chosen per model** — see §10.

---

## 2. `read` output format

Constants ([read.ts#L13-L19](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L13-L19)):
```ts
const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`
const MAX_BYTES = 50 * 1024          // 50 KB per read call
const SAMPLE_BYTES = 4096            // binary/MIME sniff window
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg","image/png","image/gif","image/webp"])
```
- **Envelope** ([#L338](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L338-L350)):
  ```
  <path>/abs/file</path>
  <type>file</type>
  <content>
  1: first line
  2: second line

  (End of file - total 2 lines)
  </content>
  ```
  Prefix is `${lineNo}: ` (number, colon, space) — no padding, no tab.
- **Continue hints** (exact text):
  - byte cap hit: `(Output capped at 50 KB. Showing lines ${offset}-${last}. Use offset=${next} to continue.)` [#L345](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L345)
  - line limit hit: `(Showing lines ${offset}-${last} of ${total}. Use offset=${next} to continue.)` [#L347](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L347)
  - complete: `(End of file - total ${count} lines)` [#L349](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L349)
  - Note: when the byte cap is hit the stream stops early, so the hint gives no total.
- **Directory read** ([#L275-L282](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L275-L282)): `<path>…</path><type>directory</type><entries>` sorted names, `/` suffix for dirs (symlinks resolved), then `(Showing N of M entries. Use 'offset' parameter to read beyond entry K)` or `(M entries)`. Offset/limit page the entry list.
- **Not found**: `File not found: <path>\n\nDid you mean one of these?\n<up to 3 siblings whose names contain/are contained in the basename>` ([#L80-L98](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L94)).
- **Offset out of range**: `Offset ${offset} is out of range for this file (${count} lines)` ([~#L332](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L330-L335)).
- **Binary**: extension denylist (.zip, .docx, .xlsx, .pptx, .wasm, .pyc, …) OR any NUL byte OR >30% non-printable bytes in the first 4 KB → error `Cannot read binary file: <path>` ([#L182](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L182), [#L328](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L328)). Notably **.docx/.xlsx are refused, not extracted**.
- **Images & PDFs** ([#L306](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L306-L323)): text output is just `"Image read successfully"` / `"PDF read successfully"`; the bytes go as a `data:` URL **attachment** on the tool result (MIME sniffed from content, not just extension). PDFs are passed raw to the model, not text-extracted.
- **Lazy instructions**: when reading a file, OpenCode walks up from the file's directory to the project root and appends any not-yet-loaded `AGENTS.md`/`CLAUDE.md` as `<system-reminder>Instructions from: …</system-reminder>` once per message ([read.ts#L356](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L356), [instruction.ts#L192](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/instruction.ts#L178-L220)).
- Relative paths are silently resolved against the working dir even though the schema says "absolute" ([#L235](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/read.ts#L235)). Same leniency in glob/grep/edit/write.

---

## 3. grep / glob caps and format

**glob** ([glob.ts#L49-L63](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/glob.ts#L49-L63)): `limit = 100`, `truncated = files.length === limit`. Output = absolute paths, one per line; empty → `No files found`; truncated → `(Results are truncated: showing first 100 results. Consider using a more specific path or pattern.)`. Backed by `rg --files --glob=<pattern> --glob=!**/.git/**` ([ripgrep.ts#L160-L167](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/ripgrep.ts#L160-L167)) — respects .gitignore, **no sort at this SHA** (ripgrep traversal order).
- Historical: until ~April 2026 glob and grep sorted by **mtime descending** (newest first) ([glob.ts@d6840868d4#L74](https://github.com/anomalyco/opencode/blob/d6840868d4/packages/opencode/src/tool/glob.ts#L74), [grep.ts@d6840868d4#L100](https://github.com/anomalyco/opencode/blob/d6840868d4/packages/opencode/src/tool/grep.ts#L100)). Dropped in the ripgrep/Effect refactor; I did not find a stated reason (**UNVERIFIED** why).

**grep** ([grep.ts#L62-L103](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/grep.ts#L62-L103)): `rg --json --hidden --no-messages [--glob=include] --glob=!**/.git/** -- pattern .`, `limit: 100` matches. Output:
```
Found 37 matches            // or "Found 100 matches (more matches available)"
/abs/a.ts:
  Line 12: matched line text
  Line 40: ...

/abs/b.ts:
  Line 3: ...

(Results truncated. Consider using a more specific path or pattern.)
```
Empty → `No files found`. Each matched line is cut at 2000 chars + `...` ([ripgrep.ts#L268](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/ripgrep.ts#L268)); ≤100 submatches per line; a single rg JSON record >64 KB fails ([#L19](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/ripgrep.ts#L19)). No context lines.

---

## 4. edit semantics

Main body [edit.ts#L70-L212](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L70-L212); matcher [`replace()` #L682-L729](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L682-L729).

- **Guards**: `oldString === newString` → `No changes to apply: oldString and newString are identical.`; empty `oldString` on an existing file → `oldString cannot be empty when editing an existing file. Provide the exact text to replace, or use write for an intentional full-file replacement.` ([#L94](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L94)); empty `oldString` on a missing file = create file.
- **Line endings / BOM** preserved: CRLF detected and oldString/newString converted; BOM kept ([#L22-L33](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L22-L33), [#L126-L134](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L126-L134)).
- **Per-file semaphore** so concurrent edits to one file serialize ([#L35-L45](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L35-L45)).
- **Fuzzy cascade** (credited in the header to Cline's diff-apply evals and gemini-cli's editCorrector, [#L1-L4](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L1-L4)). Tried in order; each yields candidate *actual* substrings of the file:
  1. `SimpleReplacer` — exact.
  2. `LineTrimmedReplacer` — line-by-line compare after `.trim()`.
  3. `BlockAnchorReplacer` — ≥3 lines; first+last line match (trimmed), block size within ±25%, middle similarity via Levenshtein, threshold `0.65` ([#L220](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L220), [#L288](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L288)).
  4. `WhitespaceNormalizedReplacer` — collapse `\s+` to one space.
  5. `IndentationFlexibleReplacer` — strip common min indent.
  6. `EscapeNormalizedReplacer` — unescape `\n`, `\t`, `\"`, etc. (model double-escaped).
  7. `TrimmedBoundaryReplacer` — trim leading/trailing whitespace of the whole block.
  8. `ContextAwareReplacer` — ≥3 lines; first/last anchors + ≥50% of middle lines match.
  9. `MultiOccurrenceReplacer` — all exact occurrences (for replaceAll).
- **Uniqueness**: for each candidate, if `indexOf !== lastIndexOf` it **continues to the next candidate/replacer**; the "multiple matches" error is thrown only if nothing unique was found anywhere. `replaceAll` takes the first located candidate and `replaceAll`s it.
- **Safety brake**: `isDisproportionateMatch` refuses if the fuzzy-matched span has ≥ max(old+3, 2×old) lines, or (multi-line) is >4× / +500 chars longer than `oldString` → `Refusing replacement because the matched span is much larger than oldString. Re-read the file and provide the full exact oldString for the intended replacement.` ([#L711](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L711), [#L731](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L731-L737)).
- **Error texts actually thrown** vs **what edit.txt promises** (drift):
  - thrown not-found: `Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.` ([#L725](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L725)) — edit.txt says `"oldString not found in content"`.
  - thrown ambiguous: `Found multiple matches for oldString. Provide more surrounding context to make the match unique.` ([#L728](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L728)) — edit.txt says "…Provide more surrounding lines in oldString to identify the correct match."
- **Must-read-before-edit / stale detection: prompt-only at v1.19.6.** edit.txt still says "This tool will error if you attempt an edit without reading the file", but edit.ts has no such check. The `FileTime` module was deleted in [`76a141090e`](https://github.com/anomalyco/opencode/commit/76a141090ea33da574d06e17cd1c5dbddbde2952) "chore: delete filetime module (#22999)" (2026-04-17), which touched edit.ts, write.ts, read.ts. Historical behaviour ([file/time.ts@715786bbf9](https://github.com/anomalyco/opencode/blob/715786bbf9/packages/opencode/src/file/time.ts)): per-session map `file → {readAt, mtime, size}` stamped on read; `assert()` before edit/write threw
  - `You must read file ${filepath} before overwriting it. Use the Read tool first`
  - `File ${filepath} has been modified since it was last read.\nLast modification: …\nLast read: …\n\nPlease read the file again before modifying it.`
  - escape hatch flag `OPENCODE_DISABLE_FILETIME_CHECK`. Why it was removed is **UNVERIFIED** (commit message gives no rationale).
- **Result**: `Edit applied successfully.` + any LSP errors for that file; UI gets a unified diff + add/del counts in metadata (not sent to the model) ([#L175-L211](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/edit.ts#L175-L211)).

---

## 5. write

[write.ts#L37-L101](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/write.ts#L37-L101):
- Always overwrites (creates parent dirs). Computes a diff against old content and passes it in the **permission request metadata** (`permission: "edit"`, [#L55](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/write.ts#L55)) so an "ask" prompt can show the diff.
- **No read-before-write enforcement** in code despite write.txt: "If this is an existing file, you MUST use the Read tool first… This tool will fail if you did not read the file first." (same FileTime removal as above).
- Output: `Wrote file successfully.` + LSP diagnostics for this file and up to 5 other files.
- write.txt also carries behavioural nudges: "ALWAYS prefer editing existing files… NEVER proactively create documentation files (*.md)".

---

## 6. Global tool-output limits

[truncate.ts](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/truncate.ts):
```ts
export const MAX_LINES = 2000
export const MAX_BYTES = 50 * 1024
const RETENTION = Duration.days(7)
```
- Applied by the generic tool wrapper to every tool **unless the tool already set `metadata.truncated`** ([tool.ts#L131](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/tool.ts#L131-L144)). read/glob/grep set it, so they are self-capped with their own specific hints; bash, webfetch, MCP/plugin tools fall through to the global cap ([registry.ts#L159](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/registry.ts#L159)).
- Configurable: `tool_output.max_lines` / `tool_output.max_bytes` ([config.ts#L141](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/v1/config/config.ts#L135-L147)).
- **Full output is written to a file** in `<data>/tool-output/tool_<id>` ([truncation-dir.ts](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/truncation-dir.ts#L4)), cleaned after 7 days. That dir is pre-allowed in `external_directory` so the model can read it back ([agent.ts#L308](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/agent/agent.ts#L296-L310)).
- **What the model sees** (head direction, [#L129-L139](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/truncate.ts#L129-L139)):
  ```
  <preview>

  ...12345 bytes truncated...

  The tool call succeeded but the output was truncated. Full output saved to: /…/tool-output/tool_XXXX
  Use Grep to search the full content or Read with offset/limit to view specific sections.
  ```
  If the agent may use the `task` tool, the hint instead says "Use the Task tool to have explore agent process this file… Do NOT read the full file yourself - delegate to save context." — **the hint adapts to the tools the agent actually has**.

---

## 7. Context hygiene

**Attached / @-mentioned files** ([prompt.ts#L787-L975](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/prompt.ts#L787-L975)): a user `file` part is expanded **at send time** into synthetic text parts that imitate a tool call:
```
Called the Read tool with the following input: {"filePath":"/abs/x.ts","offset":10,"limit":20}
<output of the real read tool: <path>…<content>…>
```
- It runs the actual `read` tool with `bypassCwdCheck` and a no-op `ask` (attachments skip permissions) ([#L822](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/prompt.ts#L808-L828)). So attached files get the **same 2000-line / 50 KB cap and continue hint** as model reads. Line ranges (`?start=&end=`) map to offset/limit.
- Directories → read's directory listing. Images/PDF → binary attachment. Pasted `data:` text/plain → same "Called the Read tool…" + decoded text ([#L787](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/prompt.ts#L787-L806)). MCP resources → `Reading MCP resource: …` + text, binary only for supported MIMEs and under a size cap.
- Failure → synthetic `Read tool failed to read <path> with the following error: …`.

**Pruning old tool results** ([compaction.ts#L271-L317](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/compaction.ts#L271-L317)):
```ts
export const PRUNE_MINIMUM = 20_000   // only prune if it frees >20k tokens
export const PRUNE_PROTECT = 40_000   // keep the most recent 40k tokens of tool output intact
const PRUNE_PROTECTED_TOOLS = ["skill"]
```
Walks backwards, skips the last 2 user turns (`if (turns < 2) continue`), stops at a previous summary, then marks older completed tool parts `time.compacted`. When converting to model messages, a compacted part's output becomes the literal **`[Old tool result content cleared]`** and its attachments are dropped ([message-v2.ts#L307-L313](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/message-v2.ts#L307-L313)). The tool *call* (name + args) stays, so the model knows it can re-read. Runs after each loop ends ([prompt.ts#L1338](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/prompt.ts#L1338)). **Opt-in at this version**: config schema says "Enable pruning of old tool outputs (default: false)" and the function returns early unless `compaction.prune` is set ([config.ts#L154](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/v1/config/config.ts#L154), [compaction.ts#L275](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/compaction.ts#L275)).

Images removed for request size are replaced with: "[This image was removed to reduce the request size and is no longer visible. Do not make claims about its contents from memory. If needed, retrieve it again with an available tool or ask the user to attach it again.]" ([message-v2.ts#L51](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/message-v2.ts#L51)).

**Compaction trigger** ([overflow.ts](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/overflow.ts)): `usable = limit.input − min(20_000, maxOutput)` (or `context − maxOutput` if no input limit); overflow when last turn's total tokens ≥ usable. Checked before the next step ([prompt.ts#L1164](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/prompt.ts#L1161-L1167)) and in the processor after usage arrives. Auto on by default (`compaction.auto`).

**Compaction mechanics** ([compaction.ts](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/compaction.ts)):
- Keeps a verbatim recent tail: `preserve_recent_tokens` default = clamp(25% of usable, 2_000, 15_000) ([#L115](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/compaction.ts#L115-L120)); can split inside a turn.
- Head is **serialized to plain text** (`[User]: …`, `[Assistant tool call]: read({...})`, `[Tool result]: …` truncated to 2_000 chars, `[Attached mime: name]`, cleared outputs stay cleared) ([#L54-L83](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/compaction.ts#L54-L83)) and sent as one user message with **no tools**, under a dedicated `compaction` agent.
- **Anchored/incremental**: the previous summary is fed back as `<prior-summary>` and merged ([core compaction.ts#L160](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/session/compaction.ts#L160-L174)).
- System prompt ([agent/prompt/compaction.txt](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/agent/prompt/compaction.txt)): "You are a context summarization agent… Do not continue the conversation. Do not respond to any questions in the conversation… Respond in the same language as the conversation."
- Template excerpt ([core compaction.ts#L16](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/session/compaction.ts#L16-L45)): sections `## Objective` / `## Important Details` / `## Work State` (`### Completed`, `### Active`, `### Blocked`) / `## Next Move` / `## Relevant Files`; rules "Keep every section, even when empty… Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers… Do not mention the summary process". Merge rules ([#L47](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/session/compaction.ts#L47-L55)): "The <conversation> is more recent… Where they conflict, the conversation wins".
- Note: `packages/core/src/session/compaction.ts` also has its own constants (`DEFAULT_KEEP_TOKENS = 8_000`) for a newer runtime path; the live CLI path above uses `opencode/src/session/compaction.ts` and only imports `buildPrompt` from core. Which path a given install uses is **UNVERIFIED**.
- `toModelMessages` accepts a `toolOutputMaxChars` option that appends `[Tool output truncated for compaction: omitted N chars]` ([message-v2.ts#L54](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/message-v2.ts#L54-L58)), but I found no production caller (only a test) — **UNVERIFIED** whether it is used.

---

## 8. Permissions

- Actions `allow | ask | deny`. Rules are `{permission, pattern, action}`; **last matching rule wins**; no match ⇒ `ask` ([permission/index.ts#L28](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/permission/index.ts#L28-L37), [docs#L91](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/web/src/content/docs/permissions.mdx#L91)). Wildcards `*` / `?`.
- Permission keys are tool-ish but grouped: `edit` covers edit/write/apply_patch; read/glob/grep/... each their own; plus guards `external_directory`, `doom_loop` ([docs#L148-L164](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/web/src/content/docs/permissions.mdx#L148-L164)). Pattern = relative file path for read/edit, the glob/regex pattern for glob/grep.
- **Defaults** ([agent.ts#L119-L136](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/agent/agent.ts#L119-L136)): `"*": "allow"` (so **edit/write are allowed without asking by default**), `doom_loop: "ask"`, `external_directory: {"*":"ask", <tool-output dir, tmp, skills>: "allow"}`, `read: {"*":"allow","*.env":"ask","*.env.*":"ask","*.env.example":"allow"}`.
  - Drift: docs say `.env` is **deny** ([permissions.mdx#L181](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/web/src/content/docs/permissions.mdx#L176-L186)); source says **ask**.
- **Plan agent** = read-only by permissions: `edit: {"*":"deny", ".opencode/plans/*.md":"allow"}` ([agent.ts#L158-L175](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/agent/agent.ts#L156-L176)). Tools whose permission is `deny` with pattern `*` are **removed from the tool list entirely** (`Permission.disabled`/`visibleTools`, [#L204](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/permission/index.ts#L204-L219)) — the model never sees tools it can't use.
- **Replies**: `once`, `always`, `reject` (optionally with feedback text). `always` pushes `{permission, pattern: each of request.always, allow}` into an in-memory `approved` list ([#L143-L153](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/permission/index.ts#L143-L153)) and auto-resolves other pending requests in that session that now match.
  - **Scope of "always"**: `approved` lives in per-instance (per project directory, process-lifetime) state and is **not keyed by session** ([#L46-L52](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/permission/index.ts#L46-L52)) — broader than the docs' "for the rest of the current OpenCode session" ([docs#L196](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/web/src/content/docs/permissions.mdx#L196)). Not persisted.
  - **File tools pass `always: ["*"]`** (read.ts, edit.ts, write.ts, glob.ts, grep.ts), so "always" on one edit approves *all* edits, not that path. Bash proposes a command-prefix pattern instead.
  - `reject` also rejects all other pending requests in the same session.
- Messages returned to the model ([core v1/permission.ts](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/core/src/v1/permission.ts#L9-L25)): "The user rejected permission to use this specific tool call." / "…with the following feedback: …" / "The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules […]".
- `--auto` mode auto-approves anything not explicitly denied ([docs#L21-L38](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/web/src/content/docs/permissions.mdx#L21-L38)).

---

## 9. System prompt and per-model variants

- Selection by model-id substring ([system.ts#L28-L51](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/system.ts#L28-L51)): `gpt-4`/`o1`/`o3` → `beast.txt`; `gpt-6` → `gpt-astra.txt`; `*codex*` → `codex.txt`; other `gpt` → `gpt.txt`; `gemini-` → `gemini.txt`; `claude` → `anthropic.txt`; `trinity`, `kimi`, Meta `muse` → their own; else `default.txt`. Sizes 4–15 KB (~1–4k tokens) ([prompt/](https://github.com/anomalyco/opencode/tree/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/prompt)).
- Why variants (inference from content, **not stated in source**): each mirrors that vendor's own agent style. `beast.txt` pushes older OpenAI models to keep going ("NEVER end your turn without having truly and completely solved the problem… when you say you are going to make a tool call, make sure you ACTUALLY make the tool call") and to avoid re-reading ("Always check if you have already read a file… do NOT re-read it"). `gemini.txt` hammers absolute-path construction ("Before using any file system tool… you must construct the full absolute path"). `anthropic.txt` emphasises TodoWrite and delegating search to Task.
- Tools are described **only in tool descriptions**; prompts reference them by name with policies ("prefer to use the Task tool in order to reduce context usage", "batch your tool calls"). default.txt still references an `ls` tool that no longer exists (stale).
- Appended env block ([system.ts#L74-L85](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/system.ts#L74-L85)): `<env> Working directory / Workspace root folder / Is directory a git repo / Platform / Today's date </env>`, plus skills list, MCP server instructions, AGENTS.md instructions.
- Prompts tell the model that `<system-reminder>` tags in tool results are system-injected, not user input (default.txt, anthropic.txt).
- **Token cost estimate** (chars/4, my estimate): file-tool descriptions read 1158 + glob 517 + grep 657 + edit 1369 + write 623 chars ≈ 4.3 KB ≈ **~1.1k tokens + ~0.3k schema ≈ 1.4k tokens** for the five file tools. All built-in tool `.txt` descriptions ≈ 15.7 KB ≈ ~4k tokens (todowrite and task are the big ones), so a full tool list is roughly **4.5–5.5k tokens** plus a 2–4k-token system prompt.

---

## 10. Things aimed at weaker / varied models

- **Malformed tool-call repair** ([llm.ts#L295-L316](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/llm.ts#L295-L316)): AI SDK `experimental_repairToolCall` — (1) if the lowercase tool name exists, retry with it (`Read` → `read`); (2) otherwise route to a hidden `invalid` tool whose output is `The arguments provided to the tool are invalid: <error>` ([invalid.ts](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/invalid.ts)). `invalid` is excluded from `activeTools` so the model can't call it directly.
- **Schema-validation errors become prose** ([tool.ts#L24-L34](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/tool.ts#L24-L34)): `The ${tool} tool was called with invalid arguments: ${detail}.\nPlease rewrite the input so it satisfies the expected schema.` — returned as the tool result, loop continues.
- **Fuzzy edit cascade + disproportionate-match brake** (§4).
- **Doom-loop guard** ([processor.ts#L29, #L356-L380](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/processor.ts#L350-L382)): if the last 3 tool parts are the same tool with identical JSON input → `doom_loop` permission ask (default ask).
- **Edit-tool flavour per model** ([registry.ts#L297-L300](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/tool/registry.ts#L297-L300)): `gpt-*` (not `oss`, not `gpt-4`) get `apply_patch` *instead of* edit/write; everyone else gets edit/write. Give each model the edit format it was trained on.
- **Read-not-found suggestions**, `DO NOT enter "undefined"` in glob's `path`, relative paths silently accepted, `"Avoid tiny repeated slices"` — small-model ergonomics.
- **Provider quirks** ([transform.ts](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/provider/transform.ts)): OpenAI-compatible JSON-schema lowering ([#L1492](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/provider/transform.ts#L1492)); Mistral tool-call-id scrubbing; per-family default temperature/topP ([#L530](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/provider/transform.ts#L530-L548)); surrogate sanitising; media in tool results moved to a separate user message for providers that can't take them ([message-v2.ts#L316-L321](https://github.com/anomalyco/opencode/blob/f4e363c8295fa90a03dddc451882fffe8fbce357/packages/opencode/src/session/message-v2.ts#L316-L321)).
- **No "simpler tool set for small models"** and no prompt-based tool-calling fallback. `capabilities.toolcall` exists on models but I found **no consumer in session code** that gates tools on it (**not found**, not proven absent).
- Coding-agent-only features (one line): bash, LSP diagnostics after edits, git snapshots/revert, subagents via `task`, `todowrite`, plan mode, skills — not relevant to a browser workspace.

---

## Borrow for a browser chat workspace

Ranked; each is grounded in verified source above. Sizes adjusted for htllm's small local contexts and its 8-call cap.

1. **Self-describing reads with an exact "continue" hint** — `<path>…</path>` + `N: line` + `(Showing lines a-b of T. Use offset=b+1 to continue.)` / `(End of file - total T lines)`; but cap at ~200–400 lines / 8–12 KB, not 2000/50 KB, because one read must not eat a 4–8k local context or burn several of 8 calls.
2. **Spill oversized output to a workspace file and return a preview + "use search_workspace / read with offset" pointer** — fits the virtual directory perfectly (e.g. `/.tool-output/…`), never loses data, and keeps the model in control of what enters context.
3. **Edit = exact string replace with uniqueness + `replaceAll`, plus a small fuzzy fallback (line-trimmed, whitespace-normalised, indentation-flexible) guarded by the disproportionate-match brake** — cheap to implement, rescues weaker OpenAI-compatible models, and the brake stops fuzzy matches swallowing whole sections of a user's draft.
4. **Actually enforce read-before-overwrite with a version stamp (store `{version, size}` per chat per file in IndexedDB; reject edit/write if unread or changed since read)** — OpenCode only *says* this now; in htllm the user can edit the same note in the UI mid-chat, so stale-write detection is real protection, and the two error strings above are good model-facing copy.
5. **Expand user-attached files as a synthetic "Called the read tool with {path}" + real read output** — one code path and one format for attachments and model reads, same caps, and the model learns the tool format from the first message.
6. **Clear old tool results to a stub like `[Old tool result content cleared]` while keeping the call (name+args), protecting the last ~2 turns** — cheapest context win; the model can re-read from the workspace, which persists. Make it on by default (OpenCode's is opt-in only because desktop contexts are big).
7. **Tool-call repair + prose validation errors** — lowercase-name retry, unknown/invalid calls routed to an "invalid" result, and `"…called with invalid arguments: <detail>. Please rewrite the input…"` as the tool result; add a 3-identical-calls doom-loop stop, which matters more under an 8-call cap.
8. **Permissions: hide denied tools entirely, default read/list/search = allow, write/edit = ask-with-diff, "always" scoped to path pattern + this chat** — OpenCode's `always: ["*"]` and instance-wide approval are too broad for a user's document library; show the diff in the approval card as OpenCode does via permission metadata.
