import type { Document, Chunk, SourceCitation } from '../providers/types';

/** Cursor offsets address extracted text, never retrieval chunk boundaries. */
export function readDocumentPage(doc: Document, chunks: Chunk[], cursor: unknown, maxChars = 8000) {
  const originalAvailable = typeof doc.extractedText === 'string';
  const text = doc.extractedText ?? chunks.map((chunk) => chunk.text).join('\n\n');
  let start = 0;
  if (cursor != null) {
    try {
      const parsed = JSON.parse(String(cursor));
      if (parsed.documentId !== doc.id || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0 || parsed.offset >= text.length) throw new Error();
      start = parsed.offset;
    } catch { throw new Error('Invalid document cursor. Start again with cursor null.'); }
  }
  const pack = (end: number) => {
    const excerpt = text.slice(start, end);
    const pages = originalAvailable ? (doc.pages ?? []).filter((p) => p.end > start && p.start < end) : [];
    const headings = originalAvailable ? [...new Set(chunks.filter((c) => c.startOffset < end && c.startOffset + c.text.length > start).map((c) => c.headingPath).filter(Boolean))].join(' / ') : undefined;
    const id = `${doc.id}:read:${start}-${end}`;
    const citation: SourceCitation = { id, chunkId: id, documentId: doc.id, filename: doc.filename, excerpt,
      pageStart: pages[0]?.page, pageEnd: pages.at(-1)?.page, headingPath: headings };
    return { text: JSON.stringify({ filename: doc.filename, text: excerpt, startOffset: start, endOffset: end, totalCharacters: text.length,
      complete: end === text.length, originalAvailable,
      warning: originalAvailable ? undefined : 'Legacy chunks only; original text unavailable. Reimport to read the exact whole file. Chunks may overlap or omit formatting.',
      nextCursor: end < text.length ? JSON.stringify({ documentId: doc.id, offset: end }) : null,
      sources: [{ id, pageStart: citation.pageStart, pageEnd: citation.pageEnd, headingPath: headings }] }), citations: excerpt ? [citation] : [] };
  };
  // Bound the serialized result, including escaped text, cursor and provenance.
  let low = start, high = Math.min(text.length, start + 4000);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (pack(mid).text.length <= maxChars) low = mid; else high = mid - 1;
  }
  // Do not split a UTF-16 surrogate pair at a page boundary.
  if (low < text.length && low > start && /[\uD800-\uDBFF]/.test(text[low - 1]!)) low--;
  if ((low === start && text.length > start) || pack(low).text.length > maxChars) throw new Error('Document read incomplete: insufficient context budget. Continue in a new turn; no text was skipped.');
  return pack(low);
}
