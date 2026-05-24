import { v4 as uuid } from 'uuid';
import type { Chunk } from '../providers/types';
import { getDb } from './db';

/**
 * Batch-insert chunks for a single document. Caller passes raw chunk data
 * without ids — this function assigns them and returns the persisted records.
 * Uses one transaction so the document either fully indexes or not at all.
 */
export async function addChunks(
  raw: Omit<Chunk, 'id'>[],
): Promise<Chunk[]> {
  if (raw.length === 0) return [];
  const chunks: Chunk[] = raw.map((c) => ({ ...c, id: uuid() }));
  const db = await getDb();
  const tx = db.transaction('chunks', 'readwrite');
  await Promise.all(chunks.map((c) => tx.store.put(c)));
  await tx.done;
  return chunks;
}

export async function getChunk(id: string): Promise<Chunk | undefined> {
  const db = await getDb();
  return db.get('chunks', id);
}

/** Get all chunks for a document, ordered by their original index. */
export async function getChunksForDocument(documentId: string): Promise<Chunk[]> {
  const db = await getDb();
  const chunks = await db.getAllFromIndex('chunks', 'byDocument', documentId);
  return chunks.sort((a, b) => a.index - b.index);
}

export async function getAllChunks(): Promise<Chunk[]> {
  const db = await getDb();
  return db.getAll('chunks');
}

export async function deleteChunksForDocument(documentId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('chunks', 'readwrite');
  const index = tx.store.index('byDocument');
  let cursor = await index.openCursor(IDBKeyRange.only(documentId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
