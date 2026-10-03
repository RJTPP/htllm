import { it, expect } from 'vitest';
import { documentTools } from './tools';
import { getDb } from '../data/db';
it('returns no evidence from every document tool when Knowledge is off', async () => {
  for (const tool of documentTools(null)) {
    const result = await tool.execute({ query: 'anything', documentId: 'other-document', index: 0 }, new AbortController().signal);
    expect(result.text).toContain('No library selected');
    expect(result.citations).toEqual([]);
  }
});
it('does not allow reading documents outside the selected library', async () => {
  const db = await getDb();
  await db.put('documents', { id: 'other-document', libraryId: 'other-library', filename: 'private.txt', mimeType: 'text/plain', sizeBytes: 3, chunkCount: 1, createdAt: 0 });
  const read = documentTools('selected').find((tool) => tool.name === 'read_document')!;
  await expect(read.execute({ documentId: 'other-document', index: 0 }, new AbortController().signal)).rejects.toThrow('outside');
});
