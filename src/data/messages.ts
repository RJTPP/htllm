import { v4 as uuid } from 'uuid';
import type { Message, ContentPart } from '../providers/types';
import { getDb } from './db';

export async function addMessage(data: Omit<Message, 'id'>): Promise<Message> {
  const message: Message = { id: uuid(), ...data };
  const db = await getDb();
  await db.put('messages', message);
  return message;
}

export async function getMessages(threadId: string): Promise<Message[]> {
  const db = await getDb();
  // Compound index [threadId, createdAt] returns messages already sorted by
  // createdAt ascending — no in-memory sort needed.
  const range = IDBKeyRange.bound([threadId], [threadId, Infinity]);
  return db.getAllFromIndex('messages', 'byThreadCreated', range);
}

export async function updateMessage(id: string, patch: Partial<Message>): Promise<void> {
  const db = await getDb();
  const existing = await db.get('messages', id);
  if (!existing) return;
  await db.put('messages', { ...existing, ...patch, id });
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('messages', id);
}

/** Delete all messages in a thread created after the given message (exclusive). */
export async function deleteMessagesAfter(threadId: string, afterMessageId: string): Promise<string[]> {
  const db = await getDb();
  const anchor = await db.get('messages', afterMessageId);
  if (!anchor) return [];
  // Use compound index to fetch only messages at or after the anchor time,
  // avoiding a full-thread scan.
  const range = IDBKeyRange.bound(
    [threadId, anchor.createdAt],
    [threadId, Infinity],
  );
  const candidates = await db.getAllFromIndex('messages', 'byThreadCreated', range);
  const toDelete = candidates.filter((m) => m.id !== afterMessageId);
  if (toDelete.length === 0) return [];
  const tx = db.transaction('messages', 'readwrite');
  for (const m of toDelete) {
    await tx.store.delete(m.id);
  }
  await tx.done;
  return toDelete.map((m) => m.id);
}

export interface MessageSearchHit {
  threadId: string;
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  /** A short excerpt of the message text around the match. */
  snippet: string;
}

/** Flatten message content to plain searchable text. */
function extractText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
}

/** Build a ~80-char excerpt centered on the match, with ellipses. */
function snippetAround(text: string, idx: number, qlen: number): string {
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + qlen + 50);
  let s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) s = `…${s}`;
  if (end < text.length) s = `${s}…`;
  return s;
}

/**
 * Full-text substring search across every message in every thread.
 * Returns newest-first hits with a short excerpt. Case-insensitive.
 */
/**
 * Full-text substring search across every message in every thread.
 * Uses an IDB cursor to avoid loading the entire messages table into memory.
 * Returns newest-first hits with a short excerpt. Case-insensitive.
 */
export async function searchMessages(
  query: string,
  limit = 25,
): Promise<MessageSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const db = await getDb();

  // Cursor-based scan — only matching hits are kept in memory.
  // Cap the collected hits to avoid unbounded memory growth; we over-collect
  // slightly to ensure we can sort newest-first and still return `limit` results.
  const collectCap = limit * 4;
  const tx = db.transaction('messages', 'readonly');
  interface HitWithTime extends MessageSearchHit { createdAt: number }
  const hits: HitWithTime[] = [];
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const m = cursor.value;
    if (m.role !== 'system') {
      const text = extractText(m.content);
      const idx = text.toLowerCase().indexOf(q);
      if (idx !== -1) {
        hits.push({
          threadId: m.threadId,
          messageId: m.id,
          role: m.role,
          snippet: snippetAround(text, idx, q.length),
          createdAt: m.createdAt,
        });
        if (hits.length >= collectCap) break;
      }
    }
    cursor = await cursor.continue();
  }
  // Sort newest-first and take top `limit`.
  hits.sort((a, b) => b.createdAt - a.createdAt);
  return hits.slice(0, limit).map(({ createdAt: _, ...hit }) => hit);
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
