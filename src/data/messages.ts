import { v4 as uuid } from 'uuid';
import type { Message } from '../providers/types';
import { getDb } from './db';

export async function addMessage(data: Omit<Message, 'id'>): Promise<Message> {
  const message: Message = { id: uuid(), ...data };
  const db = await getDb();
  await db.put('messages', message);
  return message;
}

export async function getMessages(threadId: string): Promise<Message[]> {
  const db = await getDb();
  const messages = await db.getAllFromIndex('messages', 'byThread', threadId);
  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateMessage(id: string, patch: Partial<Message>): Promise<void> {
  const db = await getDb();
  const existing = await db.get('messages', id);
  if (!existing) return;
  await db.put('messages', { ...existing, ...patch, id });
}

export async function deleteMessagesForThread(threadId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('messages', 'readwrite');
  const index = tx.store.index('byThread');
  let cursor = await index.openCursor(threadId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
