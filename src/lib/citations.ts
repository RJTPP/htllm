import type { SourceCitation } from '../providers/types';
import { sanitizeHtml } from './sanitize';

/** Resolve references against this answer's saved evidence only. */
export function citationIndex(reference: string, sources: SourceCitation[]): number {
  const ref = reference.trim();
  const exact = sources.findIndex((source) => ref === source.id || ref === source.chunkId || ref === `${source.id}: ${source.filename}` || ref === `${source.chunkId}: ${source.filename}`);
  if (exact >= 0) return exact;
  if (/^[1-9]\d*$/.test(ref)) return Number(ref) <= sources.length ? Number(ref) - 1 : -1;
  // Models also cite a file by path or name, optionally with a line or range
  // (`/library/x/a.md`, `a.md`, `a.md:3`, `a.md:L2-4`). Resolve only when that
  // points to exactly one supplied source.
  const line = /^(.+?):L?(\d+)(?:-L?(\d+))?$/.exec(ref);
  const matches = (name: string) => sources.flatMap((source, index) => source.filename === name || source.filename.endsWith(`/${name}`) ? [index] : []);
  const named = matches(ref);
  if (named.length === 1) return named[0]!;
  if (named.length || !line) return -1;
  const inFile = matches(line[1]!.trim());
  const start = Number(line[2]); const end = Number(line[3] ?? line[2]);
  const covering = inFile.filter((index) => {
    const source = sources[index]!;
    return source.lineStart !== undefined && source.lineStart <= end && (source.lineEnd ?? source.lineStart) >= start;
  });
  if (covering.length === 1) return covering[0]!;
  return inFile.length === 1 ? inFile[0]! : -1;
}

/**
 * `[[Source a]]`, plus the grouped forms models write: `[[Source a], [Source b]]`
 * and `[[Source a, Source b]]`. Group 1 is the first reference, group 2 the rest.
 */
const REFERENCE = /\[\[Source(?::\s*|\s+)([^\]\n]+)\]((?:\s*[,;]\s*\[Source(?::\s*|\s+)[^\]\n]+\])*)\]/g;
const references = (match: RegExpExecArray) => [match[1]!, ...[...match[2]!.matchAll(/\[Source(?::\s*|\s+)([^\]\n]+)\]/g)].map((m) => m[1]!)]
  .flatMap((ref) => ref.split(/\s*[,;]\s*Source(?::\s*|\s+)/));

export function renderCitationHtml(html: string, sources: SourceCitation[]): string {
  const root = document.createElement('div'); root.innerHTML = sanitizeHtml(html);
  // Model-authored data attributes cannot masquerade as generated references.
  for (const element of root.querySelectorAll('[data-source-index]')) element.removeAttribute('data-source-index');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = []; let node: Node | null;
  while ((node = walker.nextNode())) if (!node.parentElement?.closest('code, pre, a')) nodes.push(node as Text);
  for (const text of nodes) {
    const pattern = new RegExp(REFERENCE.source, 'g');
    const value = text.data; let cursor = 0; let match: RegExpExecArray | null;
    const fragment = document.createDocumentFragment();
    while ((match = pattern.exec(value))) {
      fragment.append(document.createTextNode(value.slice(cursor, match.index)));
      for (const ref of references(match)) {
        const index = citationIndex(ref, sources);
        const element = document.createElement(index >= 0 ? 'a' : 'span');
        if (index >= 0) {
          element.setAttribute('href', `#source-${index + 1}`);
          element.setAttribute('data-source-index', String(index));
          element.setAttribute('aria-label', `View source ${index + 1}: ${sources[index]!.filename}`);
          element.textContent = `[${index + 1}]`;
          element.className = 'inline-citation text-accent border border-accent/40 px-1 rounded-sm text-[11px] font-mono whitespace-nowrap';
        } else {
          element.textContent = `[unresolved source: ${ref}]`;
          element.setAttribute('title', 'The model cited a source ID that was not supplied to it.');
          element.className = 'text-mute text-[11px] font-mono underline decoration-dotted underline-offset-2';
        }
        fragment.append(element);
      }
      cursor = pattern.lastIndex;
    }
    if (cursor) { fragment.append(document.createTextNode(value.slice(cursor))); text.replaceWith(fragment); }
  }
  return root.innerHTML;
}
