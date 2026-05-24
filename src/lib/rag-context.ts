/**
 * RAG context builder — embed the user's question, retrieve relevant
 * chunks via hybrid search, and format them as a delimited block ready to
 * prepend to the system prompt.
 *
 * Important constraint: query embedding MUST be produced by the same
 * model that produced the index. Vectors from different models live in
 * different spaces and aren't comparable. The caller passes the active
 * `embeddingModelId`, and the same id is used both for query embedding
 * and `hybridSearch` filtering.
 */

import type { EmbeddingProvider } from '../providers/types';
import { hybridSearch, type SearchResult } from './hybrid-search';
import { countEmbeddingsForModel } from '../data/embeddings';

export interface RagContextOpts {
  /** Max chunks injected. Default 5. */
  topK?: number;
  /** Combined score floor; chunks below this are dropped. Default 0.5. */
  minScore?: number;
  /** Hard cap on total injected text (characters). Default 4000 (~1000 tokens). */
  maxChars?: number;
  /** Vector vs BM25 weighting forwarded to hybridSearch. Default 0.7. */
  vectorWeight?: number;
  /** Abort signal forwarded to provider.embed(). */
  signal?: AbortSignal;
}

export interface RagContextResult {
  /** Pre-formatted context block, or empty string when nothing to inject. */
  context: string;
  /** Hits actually included in `context` (for UI attribution). */
  sources: SearchResult[];
  /** Hits returned by retrieval before the char-budget trim, for diagnostics. */
  candidates: SearchResult[];
  /** Reason this call yielded an empty context — useful for logging. */
  reason?: 'no-query' | 'no-index' | 'no-matches' | 'embed-failed';
}

const DEFAULTS = {
  topK: 5,
  minScore: 0.5,
  maxChars: 4000,
  vectorWeight: 0.7,
};

/**
 * Build a RAG context block for the given query. Returns an empty context
 * with a `reason` rather than throwing, so the caller (useChat) can
 * silently skip RAG and let chat proceed normally on any failure path.
 */
export async function buildRagContext(
  query: string,
  provider: EmbeddingProvider,
  embeddingModelId: string,
  opts: RagContextOpts = {},
): Promise<RagContextResult> {
  const cfg = { ...DEFAULTS, ...opts };
  const trimmed = query.trim();
  if (!trimmed) return { context: '', sources: [], candidates: [], reason: 'no-query' };

  // Fast path: skip the embed call if no vectors exist for this model.
  const indexSize = await countEmbeddingsForModel(embeddingModelId);
  if (indexSize === 0) {
    return { context: '', sources: [], candidates: [], reason: 'no-index' };
  }

  // Embed the query with the same model that produced the index.
  let queryVector: Float32Array;
  try {
    const { vectors } = await provider.embed({
      modelId: embeddingModelId,
      inputs: [trimmed],
      signal: cfg.signal,
    });
    const v = vectors[0];
    if (!v) return { context: '', sources: [], candidates: [], reason: 'embed-failed' };
    queryVector = v;
  } catch (err) {
    console.warn('[rag] query embedding failed:', err);
    return { context: '', sources: [], candidates: [], reason: 'embed-failed' };
  }

  // Pull candidates, then enforce char budget by including chunks in
  // descending score order until we run out of room.
  const candidates = await hybridSearch(trimmed, queryVector, embeddingModelId, {
    topK: cfg.topK,
    minScore: cfg.minScore,
    vectorWeight: cfg.vectorWeight,
  });
  if (candidates.length === 0) {
    return { context: '', sources: [], candidates: [], reason: 'no-matches' };
  }

  const sources: SearchResult[] = [];
  let usedChars = 0;
  for (const hit of candidates) {
    const block = formatSourceBlock(hit);
    if (usedChars + block.length > cfg.maxChars && sources.length > 0) break;
    sources.push(hit);
    usedChars += block.length;
  }

  return { context: formatContext(sources), sources, candidates };
}

function formatSourceBlock(hit: SearchResult): string {
  const where = hit.headingPath
    ? `${hit.filename} > ${hit.headingPath}`
    : hit.filename;
  return `[Source: ${where}]\n${hit.text}`;
}

/**
 * Wrap the picked sources in a delimited block with an explicit grounding
 * instruction. Research consensus is to use clear delimiters and tell the
 * model to ground its answer in the retrieved content.
 */
function formatContext(sources: SearchResult[]): string {
  if (sources.length === 0) return '';
  const blocks = sources.map(formatSourceBlock).join('\n\n---\n\n');
  return [
    "You have access to retrieved context from the user's knowledge base.",
    'Use it to ground your answer. Cite sources by filename when relevant.',
    "If the context doesn't answer the question, say so plainly rather than guessing.",
    '',
    '<context>',
    blocks,
    '</context>',
    '',
  ].join('\n');
}
