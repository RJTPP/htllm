import type { SourceCitation } from '../providers/types';
import { sanitizeHtml } from './sanitize';

/** Resolve references against this answer's saved evidence only. */
export function citationIndex(reference: string, sources: SourceCitation[]): number {
  const ref = reference.trim();
  const exact = sources.findIndex((source) => ref === source.id || ref === source.chunkId || ref === `${source.id}: ${source.filename}` || ref === `${source.chunkId}: ${source.filename}`);
  if (exact >= 0) return exact;
  const filenames = sources.map((source, index) => source.filename === ref ? index : -1).filter((index) => index >= 0);
  if (filenames.length === 1) return filenames[0]!;
  if (/^[1-9]\d*$/.test(ref) && Number(ref) <= sources.length) return Number(ref) - 1;
  return -1;
}

export function renderCitationHtml(html: string, sources: SourceCitation[]): string {
  const root = document.createElement('div'); root.innerHTML = sanitizeHtml(html);
  // Model-authored data attributes cannot masquerade as generated references.
  for (const element of root.querySelectorAll('[data-source-index]')) element.removeAttribute('data-source-index');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = []; let node: Node | null;
  while ((node = walker.nextNode())) if (!node.parentElement?.closest('code, pre, a')) nodes.push(node as Text);
  for (const text of nodes) {
    const pattern = /\[\[Source(?::\s*|\s+)([^\]\n]+)\]\]/g;
    const value = text.data; let cursor = 0; let match: RegExpExecArray | null;
    const fragment = document.createDocumentFragment();
    while ((match = pattern.exec(value))) {
      fragment.append(document.createTextNode(value.slice(cursor, match.index)));
      const index = citationIndex(match[1]!, sources);
      const element = document.createElement(index >= 0 ? 'a' : 'span');
      if (index >= 0) {
        element.setAttribute('href', `#source-${index + 1}`);
        element.setAttribute('data-source-index', String(index));
        element.setAttribute('aria-label', `View source ${index + 1}: ${sources[index]!.filename}`);
        element.textContent = `[${index + 1}]`;
        element.className = 'inline-citation text-accent border border-accent/40 px-1 rounded-sm text-[11px] font-mono whitespace-nowrap';
      } else {
        element.textContent = `[unresolved source: ${match[1]}]`;
        element.className = 'text-warn';
      }
      fragment.append(element); cursor = pattern.lastIndex;
    }
    if (cursor) { fragment.append(document.createTextNode(value.slice(cursor))); text.replaceWith(fragment); }
  }
  return root.innerHTML;
}
