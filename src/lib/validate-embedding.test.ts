import { it, expect } from 'vitest';
import { validateEmbedding } from './validate-embedding';
it('validates model identity, dimensions, count and finite coordinates', () => {
  const result = { modelId: 'embedding', dim: 2, vectors: [new Float32Array([1, 0])] };
  expect(validateEmbedding(result, 1, 'embedding', 2)).toBe(2);
  expect(() => validateEmbedding(result, 2, 'embedding')).toThrow();
  expect(() => validateEmbedding(result, 1, 'other')).toThrow();
  expect(() => validateEmbedding(result, 1, 'embedding', 3)).toThrow();
  expect(() => validateEmbedding({ ...result, vectors: [new Float32Array([NaN, 1])] }, 1, 'embedding')).toThrow();
});
