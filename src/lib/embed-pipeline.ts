/**
 * Embedding pipeline — turn stored chunks into vectors via an
 * EmbeddingProvider. Batches calls (default 32 inputs/request) so we stay
 * under API rate limits without round-tripping per chunk. Reports progress
 * via an optional callback so long-running embeds can show a progress bar.
 */

import type { EmbeddingProvider, EmbeddingRecord } from '../providers/types';
import { getChunksForDocument } from '../data/chunks';
import { saveEmbeddings } from '../data/embeddings';
import { listDocuments } from '../data/documents';
import { invalidateHybridSearchCache } from './hybrid-search';

export interface EmbedProgress {
  embedded: number;
  total: number;
  /** Current document being processed, if available. */
  documentId?: string;
}

export interface EmbedPipelineOpts {
  /** Inputs per /v1/embeddings call. Default 32. */
  batchSize?: number;
  /** Abort the in-flight embed. */
  signal?: AbortSignal;
}

const DEFAULT_BATCH_SIZE = 32;

/**
 * Embed every chunk of a single document. Existing embeddings for the
 * same (chunkId, modelId) pair are overwritten — the embeddings store
 * uses a composite key `[chunkId, embeddingModelId]` (D2) so vectors
 * from different models coexist instead of clobbering each other.
 */
export async function embedDocument(
  documentId: string,
  provider: EmbeddingProvider,
  modelId: string,
  onProgress?: (p: EmbedProgress) => void,
  opts: EmbedPipelineOpts = {},
): Promise<number> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const chunks = await getChunksForDocument(documentId);
  if (chunks.length === 0) return 0;

  let embedded = 0;
  for (let i = 0; i < chunks.length; i += batchSize) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const batch = chunks.slice(i, i + batchSize);
    const result = await provider.embed({
      modelId,
      inputs: batch.map((c) => c.text),
      signal: opts.signal,
    });
    const records: EmbeddingRecord[] = batch.map((chunk, idx) => {
      const vec = result.vectors[idx];
      if (!vec) {
        throw new Error(`Embedding pipeline: provider returned no vector for chunk ${chunk.id}`);
      }
      return {
        chunkId: chunk.id,
        embeddingModelId: modelId,
        dim: vec.length,
        vector: Array.from(vec),
      };
    });
    await saveEmbeddings(records);
    embedded += records.length;
    onProgress?.({ embedded, total: chunks.length, documentId });
  }

  // Vectors changed — drop the BM25 cache too, since chunks may be new.
  invalidateHybridSearchCache();
  return embedded;
}

/**
 * Embed every document in the knowledge base. Used when the user switches
 * embedding models and needs to rebuild the entire index.
 */
export async function embedAllDocuments(
  provider: EmbeddingProvider,
  modelId: string,
  onProgress?: (p: EmbedProgress) => void,
  opts: EmbedPipelineOpts = {},
): Promise<number> {
  const docs = await listDocuments();
  const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0);
  if (totalChunks === 0) return 0;

  let embedded = 0;
  for (const doc of docs) {
    await embedDocument(
      doc.id,
      provider,
      modelId,
      (sub) => {
        // Report progress in terms of the global total, not per-document.
        onProgress?.({
          embedded: embedded + sub.embedded,
          total: totalChunks,
          documentId: doc.id,
        });
      },
      opts,
    );
    embedded += doc.chunkCount;
  }
  return embedded;
}
