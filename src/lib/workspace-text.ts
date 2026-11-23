/**
 * Pure text helpers for Workspace tools: context-band limits, line windows
 * with page markers, lexical search and guarded grep. No IndexedDB, no DOM.
 */

export interface Band {
  /** Maximum lines per read_file call. */
  lines: number;
  /** Maximum characters of any single tool result. */
  chars: number;
  /** Maximum tool calls per answer. */
  calls: number;
}

/** D-29: limits scale with the model's context window in three bands. */
export function contextBand(contextWindow: number): Band {
  if (contextWindow <= 8192) return { lines: 120, chars: 3000, calls: 12 };
  if (contextWindow <= 32768) return { lines: 250, chars: 8000, calls: 16 };
  return { lines: 400, chars: 16000, calls: 24 };
}

export type Pages = { page: number; start: number; end: number }[] | undefined;

/** Lines longer than this are wrapped into several numbered lines. */
export const WRAP = 400;

export interface Span { start: number; end: number }

/**
 * The line model every Workspace tool shares: split on newlines, then wrap
 * any line longer than WRAP characters (at the last space when there is one).
 * PDF extraction can put a whole page on one line; wrapping keeps every
 * character reachable by line number, and keeps read, grep, search, copy and
 * citations agreeing on what "line N" means. Line N is spans[N-1].
 */
export function lineSpans(text: string): Span[] {
  const spans: Span[] = [];
  if (!text) return spans;
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    let at = start;
    while (end - at > WRAP) {
      const space = text.lastIndexOf(' ', at + WRAP);
      const cut = space > at + WRAP / 2 ? space + 1 : at + WRAP;
      spans.push({ start: at, end: cut });
      at = cut;
    }
    spans.push({ start: at, end });
    if (newline === -1) break;
    start = newline + 1;
  }
  return spans;
}

/** Line texts under the shared line model. */
export function splitLines(text: string): string[] {
  return lineSpans(text).map((s) => text.slice(s.start, s.end));
}

export function pageAt(pages: Pages, offset: number): number | undefined {
  return pages?.find((p) => offset >= p.start && offset < p.end)?.page ?? pages?.findLast((p) => offset >= p.start)?.page;
}

export interface ReadWindow {
  output: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  /** Raw text of the lines returned (no line numbers), for citations. */
  excerpt: string;
  pageStart?: number;
  pageEnd?: number;
}

/**
 * Read lines [offset, offset+limit) as `N: text`, bounded by `maxChars`.
 * Page changes are marked with `--- page N ---`. A line is at most WRAP
 * characters, so every call makes progress. Ends with an exact hint for the
 * next call.
 */
export function readWindow(path: string, text: string, pages: Pages, offset: number, limit: number, maxChars: number): ReadWindow {
  const spans = lineSpans(text);
  const totalLines = spans.length;
  const first = Math.max(1, Math.floor(offset));
  if (totalLines === 0) return { output: `<${path}> is empty.`, startLine: 1, endLine: 0, totalLines, excerpt: '' };
  if (first > totalLines) throw new Error(`Offset ${first} is past the end of ${path} (${totalLines} lines).`);
  const body: string[] = [];
  let used = path.length + 100;
  let last = first - 1;
  let page: number | undefined;
  let pageStart: number | undefined;
  for (let n = first; n < first + limit && n <= totalLines; n++) {
    const span = spans[n - 1]!;
    const linePage = pageAt(pages, span.start);
    const marker = linePage !== undefined && linePage !== page ? `--- page ${linePage} ---\n` : '';
    const entry = `${marker}${n}: ${text.slice(span.start, span.end)}`;
    if (n > first && used + entry.length + 1 > maxChars) break;
    body.push(entry);
    used += entry.length + 1; last = n;
    if (linePage !== undefined) { page = linePage; pageStart ??= linePage; }
  }
  const hint = last < totalLines
    ? `(Showing lines ${first}-${last} of ${totalLines}. Use offset=${last + 1} to continue.)`
    : `(End of file: ${totalLines} lines.)`;
  return {
    output: `<${path}>\n${body.join('\n')}\n${hint}`,
    startLine: first, endLine: last, totalLines,
    excerpt: text.slice(spans[first - 1]!.start, spans[last - 1]!.end), pageStart, pageEnd: page,
  };
}

export interface LineHit { path: string; line: number; text: string; score: number }

const words = (s: string) => [...new Set(s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])];

/** Keyword search: lines scored by how many distinct query words they contain. */
export function lexicalSearch(files: { path: string; text: string }[], query: string, max = 10): LineHit[] {
  const terms = words(query);
  if (!terms.length) return [];
  const phrase = query.trim().toLowerCase();
  const hits: LineHit[] = [];
  for (const file of files) {
    splitLines(file.text).forEach((text, i) => {
      const lower = text.toLowerCase();
      let score = terms.filter((t) => lower.includes(t)).length;
      if (!score) return;
      if (phrase.length > 3 && lower.includes(phrase)) score += terms.length;
      hits.push({ path: file.path, line: i + 1, text, score });
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line).slice(0, max);
}

/**
 * Build a regex the model supplied, refusing shapes known to backtrack
 * catastrophically (nested quantifiers, backreferences) and very long or
 * quantifier-heavy patterns. Matching runs on the main thread, where a
 * timeout cannot interrupt a single `test()`, so the guard is the defense.
 */
export function safeRegex(pattern: string, ignoreCase: boolean): RegExp {
  if (pattern.length > 200) throw new Error('Pattern is too long (200 characters at most).');
  if (/\\[1-9]|\\k</.test(pattern)) throw new Error('Backreferences are not supported in grep patterns.');
  if (/\((?:[^()\\]|\\.)*[*+?}](?:[^()\\]|\\.)*\)\s*[*+?{]/.test(pattern)) throw new Error('Nested quantifiers like (a+)+ are not supported. Simplify the pattern.');
  if (/\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)\s*[*+?{]/.test(pattern)) throw new Error('A repeated group with alternatives, like (a|b)+, is not supported. Simplify the pattern or grep each word separately.');
  if ((pattern.match(/[*+?]|\{\d/g) ?? []).length > 6) throw new Error('Too many quantifiers in the pattern. Simplify it or use plain text.');
  try { return new RegExp(pattern, ignoreCase ? 'i' : ''); } catch { throw new Error(`Invalid regular expression: ${pattern}`); }
}

/** Lines longer than this are matched on their first part only. */
const GREP_LINE_CAP = 1000;

export function grepFiles(files: { path: string; text: string }[], pattern: string, opts: { regex?: boolean; ignoreCase?: boolean; max?: number } = {}): { hits: LineHit[]; more: number } {
  const max = opts.max ?? 50;
  const test = opts.regex
    ? ((re) => (line: string) => re.test(line))(safeRegex(pattern, !!opts.ignoreCase))
    : opts.ignoreCase
      ? ((needle) => (line: string) => line.toLowerCase().includes(needle))(pattern.toLowerCase())
      : (line: string) => line.includes(pattern);
  const hits: LineHit[] = [];
  let more = 0;
  for (const file of files) {
    splitLines(file.text).forEach((text, i) => {
      if (!test(text.slice(0, GREP_LINE_CAP))) return;
      if (hits.length < max) hits.push({ path: file.path, line: i + 1, text, score: 1 });
      else more++;
    });
  }
  return { hits, more };
}

/** One result line, trimmed for display to the model. */
export function snippet(text: string, max = 200): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
