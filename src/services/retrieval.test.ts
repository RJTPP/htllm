import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../data/db';
import { invalidateHybridSearchCache } from '../lib/hybrid-search';
import type { EmbeddingProvider } from '../providers/types';

// Deterministic lexical vectors: a test fixture, not an embedding model.
const vocab = ['alpha', 'beta', 'gamma', 'delta'];
const vector = (text: string) => vocab.map((word) => (text.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) ?? []).length);
const embedding: EmbeddingProvider = { id: 'fixture', embed: async ({ inputs }) => ({ modelId: 'lex', dim: vocab.length, vectors: inputs.map((t) => Float32Array.from(vector(t))) }), listEmbeddingModels: async () => [] } as unknown as EmbeddingProvider;
let provider: EmbeddingProvider | undefined = embedding;
vi.mock('../providers/registry', () => ({ getEmbeddingProvider: () => provider }));
const { retrieve } = await import('./retrieval');

async function seed({ indexAll = true } = {}) {
  const db = await getDb();
  await db.put('libraries', { id: 'lib', name: 'Lib', embeddingModelId: 'lex', embeddingProviderId: 'fixture', createdAt: 1 });
  const docs = [['d1', 'alpha alpha beta'], ['d2', 'gamma delta']] as const;
  for (const [id, text] of docs) {
    await db.put('documents', { id, libraryId: 'lib', filename: `${id}.md`, mimeType: 'text/markdown', sizeBytes: text.length, chunkCount: 1, createdAt: 1 });
    await db.put('chunks', { id: `${id}-c`, documentId: id, index: 0, text, startOffset: 0, pageStart: 2, pageEnd: 2 });
    if (indexAll || id === 'd1') await db.put('embeddings', { chunkId: `${id}-c`, embeddingModelId: 'lex', dim: vocab.length, vector: vector(text) });
  }
  invalidateHybridSearchCache();
}

beforeEach(async () => { const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name); provider = embedding; });

describe('retrieve', () => {
  it('returns context with citations carrying document and page provenance', async () => {
    await seed();
    const result = await retrieve('lib', 'alpha');
    expect(result.citations[0]).toMatchObject({ documentId: 'd1', filename: 'd1.md', pageStart: 2, chunkId: 'd1-c' });
    expect(result.context).toContain('alpha');
  });
  it('refuses a library without an embedding model or provider', async () => {
    const db = await getDb();
    await db.put('libraries', { id: 'bare', name: 'Bare', embeddingModelId: '', createdAt: 1 });
    await expect(retrieve('bare', 'q')).rejects.toThrow('configure the library embedding model');
    await seed(); provider = undefined;
    await expect(retrieve('lib', 'q')).rejects.toThrow('embedding provider');
  });
  it('refuses a partly indexed or empty library instead of answering from part of it', async () => {
    await seed({ indexAll: false });
    await expect(retrieve('lib', 'alpha')).rejects.toThrow('not fully indexed');
    const db = await getDb(); await db.put('libraries', { id: 'empty', name: 'E', embeddingModelId: 'lex', embeddingProviderId: 'fixture', createdAt: 1 });
    await expect(retrieve('empty', 'alpha')).rejects.toThrow('empty or not fully indexed');
  });
});
