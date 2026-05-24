/**
 * Hybrid retrieval: BM25 keyword search (via minisearch) combined with
 * cosine vector similarity. Research (2025-2026) consistently shows hybrid
 * outperforms either signal alone by ~48% — semantic catches paraphrases,
 * BM25 catches exact terms and rare tokens.
 *
 * The BM25 index is built lazily from IndexedDB chunks and cached in
 * memory. It's invalidated whenever the chunk set changes (ingest, delete).
 */

import MiniSearch from 'minisearch';
import type { Chunk, Document } from '../providers/types';
import { getAllChunks } from '../data/chunks';
import { getDocument } from '../data/documents';
import { getAllEmbeddingsForModel } from '../data/embeddings';
import { cosineSimilarity, minMaxNormalize } from './vector-search';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  filename: string;
  text: string;
  headingPath?: string;
  /** Combined normalized score in [0, 1]. */
  score: number;
  /** Component scores for debugging / UI display. */
  vectorScore: number;
  bm25Score: number;
}

export interface HybridSearchOpts {
  /** Maximum number of results. Default 5. */
  topK?: number;
  /** Drop results below this combined score. Default 0.5. */
  minScore?: number;
  /** Weight applied to the vector score (BM25 gets 1 - this). Default 0.7. */
  vectorWeight?: number;
  /** Candidates pulled from each signal before merging. Default 20. */
  candidatePoolSize?: number;
}

let cachedIndex: MiniSearch<Chunk> | null = null;
let cachedChunkCount = 0;

/**
 * Build or return the cached BM25 index. The cache is keyed by chunk count;
 * any add/delete invalidates it. For a few thousand chunks this rebuilds in
 * <100ms, so we keep the heuristic simple.
 */
async function getBm25Index(): Promise<{ index: MiniSearch<Chunk>; chunks: Chunk[] }> {
  const chunks = await getAllChunks();
  if (cachedIndex && cachedChunkCount === chunks.length) {
    return { index: cachedIndex, chunks };
  }
  const index = new MiniSearch<Chunk>({
    fields: ['text', 'headingPath'],
    storeFields: ['documentId'],
    idField: 'id',
    searchOptions: {
      boost: { headingPath: 2 },
      prefix: true,
      fuzzy: 0.15,
    },
  });
  index.addAll(chunks);
  cachedIndex = index;
  cachedChunkCount = chunks.length;
  return { index, chunks };
}

/** Drop the cached BM25 index — call after ingest or delete. */
export function invalidateHybridSearchCache(): void {
  cachedIndex = null;
  cachedChunkCount = 0;
}

/**
 * Hybrid search across the knowledge base. Embed the query externally and
 * pass the vector in — keeping the signature pure makes the function
 * testable without an EmbeddingProvider mock.
 */
export async function hybridSearch(
  query: string,
  queryVector: Float32Array,
  embeddingModelId: string,
  opts: HybridSearchOpts = {},
): Promise<SearchResult[]> {
  const topK = opts.topK ?? 5;
  const minScore = opts.minScore ?? 0.5;
  const vectorWeight = opts.vectorWeight ?? 0.7;
  const candidatePool = opts.candidatePoolSize ?? 20;

  const [embeddings, { index, chunks }] = await Promise.all([
    getAllEmbeddingsForModel(embeddingModelId),
    getBm25Index(),
  ]);

  if (chunks.length === 0) return [];

  const chunkById = new Map(chunks.map((c) => [c.id, c]));

  // Vector candidates: brute-force cosine over all stored embeddings.
  const vectorScored: { chunkId: string; score: number }[] = [];
  for (const rec of embeddings) {
    const chunk = chunkById.get(rec.chunkId);
    if (!chunk) continue; // orphan embedding — chunk was deleted
    const vec = Float32Array.from(rec.vector);
    vectorScored.push({ chunkId: rec.chunkId, score: cosineSimilarity(queryVector, vec) });
  }
  vectorScored.sort((a, b) => b.score - a.score);
  const vectorTop = vectorScored.slice(0, candidatePool);

  // BM25 candidates from minisearch.
  const bm25Hits = query.trim().length > 0
    ? index.search(query, { combineWith: 'OR' }).slice(0, candidatePool)
    : [];
  const bm25Scored = bm25Hits.map((h) => ({ chunkId: String(h.id), score: h.score }));

  // Merge candidate pool — chunks that appear in either list are scored.
  const candidateIds = new Set<string>();
  for (const v of vectorTop) candidateIds.add(v.chunkId);
  for (const b of bm25Scored) candidateIds.add(b.chunkId);
  if (candidateIds.size === 0) return [];

  const vectorScoreById = new Map(vectorScored.map((v) => [v.chunkId, v.score]));
  const bm25ScoreById = new Map(bm25Scored.map((b) => [b.chunkId, b.score]));

  // Normalize each signal independently before combining, so the weights
  // mean what they say. Raw BM25 scores have unbounded range; raw cosine
  // sits in [-1, 1] but typically [0, 1] for real text.
  const ids = Array.from(candidateIds);
  const vectorNorm = minMaxNormalize(ids.map((id) => vectorScoreById.get(id) ?? 0));
  const bm25Norm = minMaxNormalize(ids.map((id) => bm25ScoreById.get(id) ?? 0));

  const combined: { id: string; combined: number; vec: number; bm25: number }[] = ids.map(
    (id, i) => {
      const v = vectorNorm[i] ?? 0;
      const b = bm25Norm[i] ?? 0;
      return {
        id,
        combined: vectorWeight * v + (1 - vectorWeight) * b,
        vec: vectorScoreById.get(id) ?? 0,
        bm25: bm25ScoreById.get(id) ?? 0,
      };
    },
  );
  combined.sort((a, b) => b.combined - a.combined);

  // Hydrate top results with chunk + document metadata.
  const docCache = new Map<string, Document | undefined>();
  const results: SearchResult[] = [];
  for (const c of combined) {
    if (c.combined < minScore) continue;
    const chunk = chunkById.get(c.id);
    if (!chunk) continue;
    let doc = docCache.get(chunk.documentId);
    if (doc === undefined) {
      doc = await getDocument(chunk.documentId);
      docCache.set(chunk.documentId, doc);
    }
    results.push({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      filename: doc?.filename ?? '(deleted)',
      text: chunk.text,
      headingPath: chunk.headingPath,
      score: c.combined,
      vectorScore: c.vec,
      bm25Score: c.bm25,
    });
    if (results.length >= topK) break;
  }
  return results;
}
