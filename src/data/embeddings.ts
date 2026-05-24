import type { EmbeddingRecord } from '../providers/types';
import { getDb } from './db';
import { getChunksForDocument } from './chunks';

/**
 * Batch-upsert embeddings. Keyed by chunkId, so re-embedding a chunk
 * naturally replaces its previous vector.
 */
export async function saveEmbeddings(records: EmbeddingRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('embeddings', 'readwrite');
  await Promise.all(records.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function getEmbedding(chunkId: string): Promise<EmbeddingRecord | undefined> {
  const db = await getDb();
  return db.get('embeddings', chunkId);
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

export async function deleteEmbeddingsForDocument(documentId: string): Promise<void> {
  // Embeddings are keyed by chunkId but don't carry documentId, so we look
  // up the document's chunks first and delete by their ids.
  const chunks = await getChunksForDocument(documentId);
  if (chunks.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('embeddings', 'readwrite');
  await Promise.all(chunks.map((c) => tx.store.delete(c.id)));
  await tx.done;
}

/**
 * Drop every embedding produced by a specific model — used when the user
 * switches embedding models, since vectors from different models live in
 * incompatible spaces (locked decision D2).
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
