import type { EmbeddingRecord } from '../providers/types';
import { getDb } from './db';
import { getChunksForDocument } from './chunks';

/**
 * Embeddings store has a composite key [chunkId, embeddingModelId] so
 * each chunk can hold one vector per model simultaneously. Switching
 * embedding models doesn't lose prior vectors — they live side by side,
 * isolated by the model id used at retrieval time.
 */

/**
 * Batch-upsert embeddings. Keyed by [chunkId, embeddingModelId], so
 * re-embedding the same chunk with the same model overwrites cleanly
 * while leaving vectors from other models untouched.
 */
export async function saveEmbeddings(records: EmbeddingRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('embeddings', 'readwrite');
  await Promise.all(records.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function getEmbedding(
  chunkId: string,
  embeddingModelId: string,
): Promise<EmbeddingRecord | undefined> {
  const db = await getDb();
  return db.get('embeddings', [chunkId, embeddingModelId]);
}

/**
 * Load every embedding produced by a given model. The caller is the
 * vector-search layer, which compares against the query vector in-memory.
 * For 10K chunks at 1536 dim, this is ~60MB — acceptable for Phase 3.
 */
export async function getAllEmbeddingsForModel(
  embeddingModelId: string,
): Promise<EmbeddingRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('embeddings', 'byModel', embeddingModelId);
}

/**
 * Drop every vector for the given document across ALL models. Used by
 * the document delete cascade.
 */
export async function deleteEmbeddingsForDocument(documentId: string): Promise<void> {
  const chunks = await getChunksForDocument(documentId);
  if (chunks.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('embeddings', 'readwrite');
  const byChunk = tx.store.index('byChunk');
  // Each chunk may have multiple records (one per model) — iterate the
  // byChunk index per chunkId and delete every match.
  for (const chunk of chunks) {
    let cursor = await byChunk.openCursor(IDBKeyRange.only(chunk.id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

/**
 * Drop every vector produced by a specific model. Optional — switching
 * models no longer requires this (vectors coexist), but the UI may still
 * want to "free up storage by deleting vectors for an unused model".
 */
export async function invalidateEmbeddingsForModel(
  embeddingModelId: string,
): Promise<number> {
  const db = await getDb();
  const tx = db.transaction('embeddings', 'readwrite');
  const index = tx.store.index('byModel');
  let cursor = await index.openCursor(IDBKeyRange.only(embeddingModelId));
  let count = 0;
  while (cursor) {
    await cursor.delete();
    count++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return count;
}

export async function countEmbeddingsForModel(
  embeddingModelId: string,
): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('embeddings', 'byModel', embeddingModelId);
}

/**
 * Distinct embedding model ids that have at least one stored vector.
 * Useful for the Storage page so users can see which model indexes exist
 * and clear unused ones to reclaim space.
 */
export async function listEmbeddingModelIdsWithData(): Promise<string[]> {
  const db = await getDb();
  const ids = new Set<string>();
  let cursor = await db.transaction('embeddings').store.index('byModel').openKeyCursor();
  while (cursor) {
    ids.add(String(cursor.key));
    cursor = await cursor.continue();
  }
  return Array.from(ids).sort();
}
