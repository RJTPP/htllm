import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../data/db';
import { addUpload } from '../data/workspace';
import type { EmbeddingProvider } from '../providers/types';

const embed = vi.fn(async ({ inputs }: { inputs: string[] }) => ({ modelId: 'lex', dim: 2, vectors: inputs.map(() => Float32Array.from([1, 0])) }));
vi.mock('../providers/registry', () => ({ getEmbeddingProvider: (id: string) => (id === 'fixture' ? ({ id: 'fixture', embed, listEmbeddingModels: async () => [] } as unknown as EmbeddingProvider) : undefined) }));
const { addToLibrary } = await import('./library-add');

beforeEach(async () => {
  const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name);
  await db.put('threads', { id: 't', title: 't', providerId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1, mode: 'workspace' });
  embed.mockClear();
});

describe('addToLibrary', () => {
  it('copies an upload into a library with its page offsets and indexes it', async () => {
    const db = await getDb();
    await db.put('libraries', { id: 'lib', name: 'Lib', embeddingModelId: 'lex', embeddingProviderId: 'fixture', createdAt: 1 });
    const text = 'Page one text.\n\nPage two text.';
    const up = await addUpload({ threadId: 't', path: '/uploads/report.pdf', text, mimeType: 'application/pdf', pages: [{ page: 1, start: 0, end: 14 }, { page: 2, start: 16, end: 30 }] });
    const statuses: string[] = [];
    const result = await addToLibrary(up.id, 'lib', { onStatus: (s) => statuses.push(s) });
    expect(result.indexed).toBe(true);
    expect(statuses).toEqual(['adding', 'indexing']);
    const doc = await db.get('documents', result.documentId);
    expect(doc).toMatchObject({ libraryId: 'lib', filename: 'report.pdf', mimeType: 'application/pdf', extractedText: text, pages: up.pages });
    const chunks = await db.getAllFromIndex('chunks', 'byDocument', result.documentId);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.pageStart !== undefined)).toBe(true);
    expect(await db.count('embeddings')).toBe(chunks.length);
  });
  it('adds without indexing when the library has no usable embedding model', async () => {
    const db = await getDb();
    await db.put('libraries', { id: 'bare', name: 'Bare', embeddingModelId: '', createdAt: 1 });
    const up = await addUpload({ threadId: 't', path: '/uploads/a.md', text: '# A\nalpha', mimeType: 'text/markdown' });
    const result = await addToLibrary(up.id, 'bare');
    expect(result.indexed).toBe(false);
    expect(embed).not.toHaveBeenCalled();
    expect((await db.get('documents', result.documentId))?.filename).toBe('a.md');
  });
  it('refuses missing files and libraries', async () => {
    await expect(addToLibrary('nope', 'lib')).rejects.toThrow('no longer exists');
    const up = await addUpload({ threadId: 't', path: '/uploads/a.txt', text: 'x', mimeType: 'text/plain' });
    await expect(addToLibrary(up.id, 'missing')).rejects.toThrow('library no longer exists');
  });
});
