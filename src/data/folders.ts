import { v4 as uuid } from 'uuid';
import type { Folder } from '../providers/types';
import { getDb } from './db';

export async function createFolder(name: string): Promise<Folder> {
  const folder: Folder = { id: uuid(), name, createdAt: Date.now() };
  const db = await getDb();
  await db.put('folders', folder);
  return folder;
}

export async function listFolders(): Promise<Folder[]> {
  const db = await getDb();
  const folders = await db.getAll('folders');
  return folders.sort((a, b) => a.createdAt - b.createdAt);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('folders', id);
  if (!existing) return;
  await db.put('folders', { ...existing, name });
}

/**
 * Delete a folder. Threads inside it are NOT deleted — the caller is
 * responsible for clearing their `folderId` (App coordinates this so the
 * in-memory thread state stays in sync).
 */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('folders', id);
}
