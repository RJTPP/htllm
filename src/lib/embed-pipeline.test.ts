import { beforeEach, expect, it, vi } from 'vitest';
import { getDb } from '../data/db';
import { embedDocument } from './embed-pipeline';
import { deleteDocument } from '../data/documents';
import type { EmbeddingProvider } from '../providers/types';
const provider = (embed: EmbeddingProvider['embed']): EmbeddingProvider => ({ id: 'fixture', listEmbeddingModels: async () => [], embed });
beforeEach(async () => {
  const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name);
  await db.put('libraries', { id: 'l', name: 'Library', embeddingProviderId: 'fixture', embeddingModelId: 'm', createdAt: 1 });
  await db.put('documents', { id: 'd', libraryId: 'l', filename: 'test.txt', mimeType: 'text/plain', sizeBytes: 4, chunkCount: 2, createdAt: 1 });
  for (let index = 0; index < 2; index++) await db.put('chunks', { id: `c${index}`, documentId: 'd', index, startOffset: index * 2, text: 'hi' });
});
it('does not persist a partial batch when a later embedding fails', async () => {
  let calls = 0;
  const p = provider(async () => { if (++calls === 2) throw new Error('offline'); return { modelId: 'm', dim: 2, vectors: [new Float32Array([1, 0])] }; });
  await expect(embedDocument('d', p, 'm', undefined, { batchSize: 1 })).rejects.toThrow('offline');
  expect(await (await getDb()).count('embeddings')).toBe(0);
});
it('does not save vectors when the document is deleted during embedding', async () => {
  const p = provider(async ({ inputs }) => { await deleteDocument('d'); return { modelId: 'm', dim: 2, vectors: inputs.map(() => new Float32Array([1, 0])) }; });
  await expect(embedDocument('d', p, 'm')).rejects.toThrow('changed');
  expect(await (await getDb()).count('embeddings')).toBe(0);
});
it('rejects a model different from the library pin before requesting vectors', async () => {
  const embed = vi.fn(); await expect(embedDocument('d', provider(embed), 'other')).rejects.toThrow('pinned'); expect(embed).not.toHaveBeenCalled();
});
