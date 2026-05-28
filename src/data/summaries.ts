import { v4 as uuid } from 'uuid';
import type { ConversationSummary } from '../providers/types';
import { getDb } from './db';

/**
 * D10b — auto-compaction summary storage.
 *
 * Invariant: at most one row per `threadId` has `active === true`.
 * Re-compaction REPLACES rather than stacking — older rows stay in the
 * store (for diagnostics / future "show prior summaries" UI) but are
 * never used in prompt construction.
 *
 * Quality decays multiplicatively when summaries stack, so we cap the
 * `generation` counter at 5 (warn at 3) and require the user to start
 * a new chat past that point. Enforcement lives in useChat, not the
 * data layer.
 */

export interface NewSummary {
  threadId: string;
  text: string;
  replacedMessageIds: string[];
  replacedTokens: number;
  summaryTokens: number;
  source: 'auto' | 'manual';
}

/**
 * Write a new active summary for the thread, marking any previous
 * active summary inactive. Returns the persisted record so the caller
 * can stash its id without re-querying.
 */
export async function saveSummary(input: NewSummary): Promise<ConversationSummary> {
  const db = await getDb();
  const tx = db.transaction('summaries', 'readwrite');
  const prior = await tx.store.index('byThread').getAll(input.threadId);
  let maxGeneration = 0;
  for (const row of prior) {
    if (row.generation > maxGeneration) maxGeneration = row.generation;
    if (row.active) {
      await tx.store.put({ ...row, active: false });
    }
  }
  const record: ConversationSummary = {
    id: uuid(),
    threadId: input.threadId,
    text: input.text,
    replacedMessageIds: input.replacedMessageIds,
    replacedTokens: input.replacedTokens,
    summaryTokens: input.summaryTokens,
    source: input.source,
    generation: maxGeneration + 1,
    createdAt: Date.now(),
    active: true,
  };
  await tx.store.put(record);
  await tx.done;
  return record;
}

/** Get the active summary for a thread, if any. */
export async function getActiveSummary(threadId: string): Promise<ConversationSummary | null> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('summaries', 'byThread', threadId);
  for (const row of rows) {
    if (row.active) return row;
  }
  return null;
}

/** All summaries for a thread, newest first — for the diagnostic UI. */
export async function listSummariesForThread(threadId: string): Promise<ConversationSummary[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('summaries', 'byThread', threadId);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Clear the active summary for a thread (e.g. after the user edits
 * an earlier message and the summary's coverage is no longer correct).
 * Leaves the historical row in place but flips active=false.
 */
export async function clearActiveSummary(threadId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('summaries', 'readwrite');
  const rows = await tx.store.index('byThread').getAll(threadId);
  for (const row of rows) {
    if (row.active) {
      await tx.store.put({ ...row, active: false });
    }
  }
  await tx.done;
}

/** Hard-delete every summary for a thread — used when the thread itself
 *  is deleted upstream. */
export async function deleteSummariesForThread(threadId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('summaries', 'readwrite');
  const index = tx.store.index('byThread');
  let cursor = await index.openCursor(IDBKeyRange.only(threadId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
