import { v4 as uuid } from 'uuid';
import type { Library } from '../providers/types';
import { getDb, DEFAULT_LIBRARY_ID } from './db';

/**
 * Library = a named group of documents pinned to one embedding model.
 * Switching the model requires re-embedding every doc inside; the data
 * layer doesn't enforce this — the embed pipeline does (uses the
 * library's model for ingestion / query embeds).
 */

export { DEFAULT_LIBRARY_ID } from './db';

interface CreateLibraryInput {
  name: string;
  embeddingModelId?: string;
  embeddingProviderId?: string;
  /** D8 Part B — opt in to contextual retrieval at creation time. */
  useContextualRetrieval?: boolean;
}

export async function createLibrary(input: CreateLibraryInput): Promise<Library> {
  const lib: Library = {
    id: uuid(),
    name: input.name.trim() || 'Untitled library',
    embeddingModelId: input.embeddingModelId ?? '',
    ...(input.embeddingProviderId ? { embeddingProviderId: input.embeddingProviderId } : {}),
    ...(input.useContextualRetrieval ? { useContextualRetrieval: true } : {}),
    createdAt: Date.now(),
  };
  const db = await getDb();
  await db.put('libraries', lib);
  return lib;
}

export async function getLibrary(id: string): Promise<Library | undefined> {
  const db = await getDb();
  return db.get('libraries', id);
}

/** List libraries, default first, then alphabetical by name. */
export async function listLibraries(): Promise<Library[]> {
  const db = await getDb();
  const libs = await db.getAll('libraries');
  return libs.sort((a, b) => {
    if (a.id === DEFAULT_LIBRARY_ID) return -1;
    if (b.id === DEFAULT_LIBRARY_ID) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function updateLibrary(
  id: string,
  patch: Partial<Omit<Library, 'id' | 'createdAt'>>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get('libraries', id);
  if (!existing) return;
  await db.put('libraries', { ...existing, ...patch });
}

/**
 * Delete a library. Documents in it must be moved or deleted first by
 * the caller (the cascade is the UI's responsibility so users aren't
 * surprised by silent doc loss). Refuses to delete the Default library.
 */
export async function deleteLibrary(id: string): Promise<void> {
  if (id === DEFAULT_LIBRARY_ID) {
    throw new Error('The Default library cannot be deleted.');
  }
  const db = await getDb();
  await db.delete('libraries', id);
}

/**
 * Ensure a library exists for new ingestion to attach to. Returns the
 * default library, creating it lazily if a fresh install (no migration)
 * somehow missed it. Idempotent.
 */
export async function ensureDefaultLibrary(): Promise<Library> {
  const existing = await getLibrary(DEFAULT_LIBRARY_ID);
  if (existing) return existing;
  const lib: Library = {
    id: DEFAULT_LIBRARY_ID,
    name: 'Default',
    embeddingModelId: '',
    createdAt: Date.now(),
  };
  const db = await getDb();
  await db.put('libraries', lib);
  return lib;
}
