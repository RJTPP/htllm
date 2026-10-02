import type { EmbeddingResult } from '../providers/types';
export function validateEmbedding(result: EmbeddingResult, count: number, modelId: string, dim?: number): number {
  if (result.modelId !== modelId) throw new Error('Embedding model changed; reconfigure and rebuild the library.');
  if (result.vectors.length !== count || !Number.isInteger(result.dim) || result.dim <= 0 || (dim !== undefined && result.dim !== dim)) throw new Error('Embedding dimensions or count do not match the index.');
  for (const vector of result.vectors) if (vector.length !== result.dim || !Array.from(vector).every(Number.isFinite)) throw new Error('Invalid embedding vector.');
  return result.dim;
}
