import { v4 as uuid } from 'uuid';
import type { ParentChunk } from '../providers/types';
import { getDb } from './db';

/**
 * Parent chunks (D8) — the larger context blocks returned to the LLM
 * after a child Chunk hit. Stored separately from chunks because they
 * have a different lifecycle (one parent maps to many embedded chunks)
 * and we don't want every chunk row to carry a redundant copy of the
 * surrounding text.
 *
 * Only new ingestion (post-D8) writes parents. Legacy chunks without a
 * parentId fall back to using their own text at retrieval time.
 */

/**
 * Batch-insert parents for a single document. Caller passes raw parent
 * data without ids — this function assigns them and returns the persisted
 * records so the caller can stitch parentId onto the matching chunks.
 */
export async function addParents(
  raw: Omit<ParentChunk, 'id'>[],
): Promise<ParentChunk[]> {
  if (raw.length === 0) return [];
  const parents: ParentChunk[] = raw.map((p) => ({ ...p, id: uuid() }));
  const db = await getDb();
  const tx = db.transaction('parents', 'readwrite');
  await Promise.all(parents.map((p) => tx.store.put(p)));
  await tx.done;
  return parents;
}

export async function getParent(id: string): Promise<ParentChunk | undefined> {
  const db = await getDb();
  return db.get('parents', id);
}

/** Batched fetch — single transaction, returns in input order, undefined for misses. */
export async function getParents(ids: string[]): Promise<(ParentChunk | undefined)[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const tx = db.transaction('parents', 'readonly');
  const results = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return results;
}

export async function getParentsForDocument(documentId: string): Promise<ParentChunk[]> {
  const db = await getDb();
  const parents = await db.getAllFromIndex('parents', 'byDocument', documentId);
  return parents.sort((a, b) => a.index - b.index);
}

export async function deleteParentsForDocument(documentId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('parents', 'readwrite');
  const index = tx.store.index('byDocument');
  let cursor = await index.openCursor(IDBKeyRange.only(documentId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
