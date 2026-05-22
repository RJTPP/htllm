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
  const threads = await db.getAll('threads');
  return threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getThread(id: string): Promise<Thread | undefined> {
  const db = await getDb();
  return db.get('threads', id);
}

export async function updateThread(id: string, patch: Partial<Thread>): Promise<void> {
  const db = await getDb();
  const existing = await db.get('threads', id);
  if (!existing) return;
  await db.put('threads', { ...existing, ...patch, id });
}

export async function deleteThread(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('threads', id);
}
