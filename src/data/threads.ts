import { v4 as uuid } from 'uuid';
import type { Thread } from '../providers/types';
import { getDb } from './db';

export async function createThread(data: Omit<Thread, 'id'>): Promise<Thread> {
  const thread: Thread = { id: uuid(), ...data };
  const db = await getDb();
  await db.put('threads', thread);
  return thread;
}

export async function listThreads(): Promise<Thread[]> {
  const db = await getDb();
  // Use the byUpdatedAt index to get threads pre-sorted ascending, then
  // reverse for newest-first without an in-memory sort.
  const threads = await db.getAllFromIndex('threads', 'byUpdatedAt');
  threads.reverse();
  return threads;
}

export async function getThread(id: string): Promise<Thread | undefined> {
  const db = await getDb();
  return db.get('threads', id);
}

export async function updateThread(id: string, patch: Partial<Thread>): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('threads', 'readwrite');
  const existing = await tx.store.get(id);
  if (existing) await tx.store.put({ ...existing, ...patch, id });
  await tx.done;
}

export async function deleteThread(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('threads', id);
}

/** Delete a thread with its messages, summaries and workspace files (D-20) in
 *  one transaction, so a failure part-way cannot leave orphaned rows. */
export async function deleteThreadCascade(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['threads', 'messages', 'summaries', 'workspaceFiles', 'workspaceVersions'], 'readwrite');
  for (const store of ['messages', 'summaries', 'workspaceFiles', 'workspaceVersions'] as const) {
    let cursor = await tx.objectStore(store).index('byThread').openCursor(IDBKeyRange.only(id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.objectStore('threads').delete(id);
  await tx.done;
}
