import { v4 as uuid } from 'uuid';
import type { Document } from '../providers/types';
import { getDb } from './db';

/**
 * Create a Document record. Chunks and embeddings are persisted separately
 * by the ingestion pipeline — this only stores the document metadata.
 * Caller must supply libraryId.
 */
export async function addDocument(
  data: Omit<Document, 'id' | 'createdAt'>,
): Promise<Document> {
  const doc: Document = { ...data, id: uuid(), createdAt: Date.now() };
  const db = await getDb();
  await db.put('documents', doc);
  return doc;
}

export async function getDocument(id: string): Promise<Document | undefined> {
  const db = await getDb();
  return db.get('documents', id);
}

/** List documents, newest first. */
export async function listDocuments(): Promise<Document[]> {
  const db = await getDb();
  const docs = await db.getAll('documents');
  return docs.sort((a, b) => b.createdAt - a.createdAt);
}

/** List documents in a single library, newest first. */
export async function listDocumentsByLibrary(libraryId: string): Promise<Document[]> {
  const db = await getDb();
  const docs = await db.getAllFromIndex('documents', 'byLibrary', libraryId);
  return docs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateDocument(
  id: string,
  patch: Partial<Omit<Document, 'id' | 'createdAt'>>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get('documents', id);
  if (!existing) return;
  await db.put('documents', { ...existing, ...patch });
}

/**
 * Delete a document and cascade to its chunks and embeddings.
 * One transaction prevents indexing from racing a partially deleted document.
 */
export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['documents', 'chunks', 'parents', 'embeddings'], 'readwrite');
  const chunks = await tx.objectStore('chunks').index('byDocument').getAll(id);
  for (const chunk of chunks) {
    let cursor = await tx.objectStore('embeddings').index('byChunk').openCursor(IDBKeyRange.only(chunk.id));
    while (cursor) { await cursor.delete(); cursor = await cursor.continue(); }
    await tx.objectStore('chunks').delete(chunk.id);
  }
  const parents = await tx.objectStore('parents').index('byDocument').getAllKeys(id);
  for (const parentId of parents) await tx.objectStore('parents').delete(parentId);
  await tx.objectStore('documents').delete(id);
  await tx.done;
}

export interface DocumentStats {
  count: number;
  totalSizeBytes: number;
  totalChunks: number;
}

export async function getDocumentStats(): Promise<DocumentStats> {
  const docs = await listDocuments();
  return {
    count: docs.length,
    totalSizeBytes: docs.reduce((sum, d) => sum + d.sizeBytes, 0),
    totalChunks: docs.reduce((sum, d) => sum + d.chunkCount, 0),
  };
}
