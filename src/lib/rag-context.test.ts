import { beforeEach, expect, it, vi } from 'vitest';
import type { EmbeddingProvider } from '../providers/types';
import { buildRagContext } from './rag-context';
import { hybridSearch } from './hybrid-search';
import { countEmbeddingsForModel } from '../data/embeddings';
vi.mock('./hybrid-search', () => ({ hybridSearch: vi.fn() }));
vi.mock('../data/embeddings', () => ({ countEmbeddingsForModel: vi.fn() }));
const provider: EmbeddingProvider = { id: 'fixture', listEmbeddingModels: async () => [], embed: async () => ({ modelId: 'm', dim: 2, vectors: [new Float32Array([1, 0])] }) };
beforeEach(() => { vi.mocked(countEmbeddingsForModel).mockResolvedValue(1); vi.mocked(hybridSearch).mockResolvedValue([{ chunkId: 'c', documentId: 'd', filename: 'large.md', text: 'x'.repeat(10_000), score: 1, vectorScore: 1, bm25Score: 1 }]); });
it.each([0, 100, 500, 2000])('bounds the first oversized result including wrappers at %s characters', async (maxChars) => {
  const result = await buildRagContext('query', provider, 'm', { maxChars, libraryIds: ['selected'] });
  expect(result.context.length).toBeLessThanOrEqual(maxChars);
  for (const source of result.sources) expect(result.context).toContain(source.text);
  expect(hybridSearch).toHaveBeenCalledWith('query', expect.any(Float32Array), 'm', expect.objectContaining({ libraryIds: ['selected'] }));
});
it('reports embedding failure separately from no matching evidence', async () => {
  const failing = { embed: async () => { throw new Error('offline'); } } as unknown as EmbeddingProvider;
  expect((await buildRagContext('query', failing, 'm')).reason).toBe('embed-failed');
  vi.mocked(hybridSearch).mockResolvedValue([]);
  expect((await buildRagContext('query', provider, 'm')).reason).toBe('no-matches');
});
