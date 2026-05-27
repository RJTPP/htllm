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
import { getParents } from '../data/parents';
import { invalidateHybridSearchCache } from './hybrid-search';
import { type Contextualizer, formatContextualizedChunk } from './contextualizer';

export interface EmbedProgress {
  embedded: number;
  total: number;
  /** Current document being processed, if available. */
  documentId?: string;
  /** D8 Part B — chunks that ran a contextualization pass before
   *  embedding. Bumped per-chunk; lets the UI show a "contextualizing…"
   *  affordance while the long pass runs. */
  contextualized?: number;
  /** When a multi-file pass (upload, embed-all) is running, these
   *  surface the per-file granularity so the UI can render
   *  "file 2/3 · chunk 18/50". 0-based fileIndex; fileTotal is set
   *  whenever fileIndex is. Single-doc flows leave both undefined. */
  fileIndex?: number;
  fileTotal?: number;
  /** Chunk counts for the file currently being processed. */
  fileChunks?: number;
  fileEmbedded?: number;
}

export interface EmbedPipelineOpts {
  /** Inputs per /v1/embeddings call. Default 32. */
  batchSize?: number;
  /** Abort the in-flight embed. */
  signal?: AbortSignal;
  /**
   * D8 Part B — when set, each chunk gets a chat-model-generated
   * situating blurb prepended before embedding (Anthropic's Contextual
   * Retrieval). Slow: one LLM call per chunk. The chunk text in IDB
   * stays unchanged; only the vector reflects the blurb. Chunks without
   * a parentId (legacy flat chunking) are skipped silently — vanilla
   * embedding only.
   */
  contextualizer?: Contextualizer | null;
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

  // D8 Part B — when contextualizing, pre-fetch every parent in a single
  // pass so we don't hit IDB per chunk. Map by id for O(1) lookup. If
  // there's no contextualizer we skip this entirely.
  const parentTextById = new Map<string, string>();
  if (opts.contextualizer) {
    const parentIds = Array.from(
      new Set(chunks.map((c) => c.parentId).filter((id): id is string => !!id)),
    );
    const parents = await getParents(parentIds);
    for (let i = 0; i < parentIds.length; i++) {
      const p = parents[i];
      if (p) parentTextById.set(parentIds[i]!, p.text);
    }
  }

  let embedded = 0;
  let contextualized = 0;
  for (let i = 0; i < chunks.length; i += batchSize) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const batch = chunks.slice(i, i + batchSize);

    // Resolve the actual input string per chunk. Contextualization is
    // sequential within a batch — running it concurrently would explode
    // LLM-side queueing on local models. The embed call below stays
    // batched, so we only pay the LLM cost serially, not the embed cost.
    const inputs: string[] = [];
    for (const chunk of batch) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      let inputText = chunk.text;
      if (opts.contextualizer && chunk.parentId) {
        const parentText = parentTextById.get(chunk.parentId);
        if (parentText) {
          const blurb = await opts.contextualizer(chunk.text, parentText, opts.signal);
          if (blurb) {
            inputText = formatContextualizedChunk(blurb, chunk.text);
            contextualized++;
            onProgress?.({
              embedded,
              total: chunks.length,
              documentId,
              contextualized,
            });
          }
        }
      }
      inputs.push(inputText);
    }

    const result = await provider.embed({
      modelId,
      inputs,
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
    onProgress?.({ embedded, total: chunks.length, documentId, contextualized });
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
