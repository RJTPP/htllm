import { v4 as uuid } from 'uuid';
import type { Document } from '../providers/types';
import { getDb } from './db';
import { deleteChunksForDocument } from './chunks';
import { deleteEmbeddingsForDocument } from './embeddings';

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
 * Three separate transactions keep the data layer functions simple; the
 * cascade is idempotent so a partial failure can be retried safely.
 */
export async function deleteDocument(id: string): Promise<void> {
  await deleteEmbeddingsForDocument(id);
  await deleteChunksForDocument(id);
  const db = await getDb();
  await db.delete('documents', id);
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
