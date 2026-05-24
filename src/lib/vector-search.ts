/**
 * Pure-JS vector similarity. Brute force over Float32Arrays is fast enough
 * for client-side use: at 1536 dim, comparing the query against 10k chunks
 * is ~15M float ops — well under 100ms on a modern device. If we ever need
 * to scale further, replace this with an ANN index (HNSW etc.) — the
 * function shapes stay the same.
 */

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Min-max normalize an array of scores to [0, 1]. If all scores are
 * identical (or only one item), every normalized score is 1.
 */
export function minMaxNormalize(scores: number[]): number[] {
  if (scores.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const s of scores) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const range = max - min;
  if (range === 0) return scores.map(() => 1);
  return scores.map((s) => (s - min) / range);
}
