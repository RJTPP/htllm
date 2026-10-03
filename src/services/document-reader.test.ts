import { expect, it } from 'vitest';
import { readDocumentPage } from './document-reader';
import type { Document } from '../providers/types';
const doc: Document = { id: 'doc', libraryId: 'lib', filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1, chunkCount: 1, createdAt: 0 };
it('reads a small original completely with provenance and matching evidence', () => {
  const output = readDocumentPage({ ...doc, extractedText: 'whole file', pages: [{ page: 2, start: 0, end: 10 }] }, [], null);
  expect(JSON.parse(output.text)).toMatchObject({ text: 'whole file', complete: true, nextCursor: null, originalAvailable: true });
  expect(output.citations[0]).toMatchObject({ excerpt: 'whole file', pageStart: 2, pageEnd: 2 });
});
it('paginates escaped text without gaps, including oversized chunks and unicode', () => {
  const text = '"\\\n😀'.repeat(2500);
  let cursor: string | null = null; let joined = ''; let pages = 0;
  do {
    const result = readDocumentPage({ ...doc, extractedText: text }, [], cursor, 1600);
    expect(result.text.length).toBeLessThanOrEqual(1600);
    const page = JSON.parse(result.text); joined += page.text; cursor = page.nextCursor; pages++;
    expect(page.complete).toBe(cursor === null);
    expect(result.citations[0]?.excerpt).toBe(page.text);
  } while (cursor);
  expect(joined).toBe(text); expect(pages).toBeGreaterThan(1);
});
it('rejects foreign cursors and insufficient budgets without advancing', () => {
  const original = { ...doc, extractedText: 'content' };
  expect(() => readDocumentPage(original, [], '{"documentId":"other","offset":1}')).toThrow('Invalid document cursor');
  expect(() => readDocumentPage(original, [], null, 1)).toThrow('incomplete');
});
it('labels legacy chunk reads honestly', () => {
  const result = readDocumentPage(doc, [{ id: 'c', documentId: doc.id, index: 0, startOffset: 0, text: 'legacy' }], null);
  expect(JSON.parse(result.text)).toMatchObject({ text: 'legacy', originalAvailable: false, complete: true });
  expect(JSON.parse(result.text).warning).toContain('Reimport');
});
