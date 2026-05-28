import { v4 as uuid } from 'uuid';
import type { ConversationSummary, SummaryKind } from '../providers/types';
import { getDb } from './db';

/**
 * D10b — auto-compaction summary storage.
 *
 * Invariant: at most one row per (`threadId`, `kind`) has
 * `active === true`. Re-compaction REPLACES rather than stacking — older
 * rows stay in the store (for diagnostics / future "show prior summaries"
 * UI) but are never used in prompt construction. The two kinds —
 * 'history' (older turns) and 'tail' (a recent oversized exchange) — feed
 * two separate prompt blocks and are tracked independently.
 *
 * Quality decays multiplicatively when summaries stack, so we cap the
 * `generation` counter at 5 (warn at 3) and require the user to start
 * a new chat past that point. Enforcement lives in useChat, not the
 * data layer.
 */

export interface NewSummary {
  threadId: string;
  kind: SummaryKind;
  text: string;
  replacedMessageIds: string[];
  replacedTokens: number;
  summaryTokens: number;
  source: 'auto' | 'manual';
}

/** Legacy rows predate `kind`; treat a missing value as 'history'. */
function rowKind(row: ConversationSummary): SummaryKind {
  return row.kind ?? 'history';
}

/**
 * Write a new active summary of the given kind, marking the previous
 * active summary OF THE SAME KIND inactive (the other kind is left
 * untouched). Returns the persisted record so the caller can stash its
 * id without re-querying.
 */
export async function saveSummary(input: NewSummary): Promise<ConversationSummary> {
  const db = await getDb();
  const tx = db.transaction('summaries', 'readwrite');
  const prior = await tx.store.index('byThread').getAll(input.threadId);
  let maxGeneration = 0;
  for (const row of prior) {
    if (rowKind(row) !== input.kind) continue;
    if (row.generation > maxGeneration) maxGeneration = row.generation;
    if (row.active) {
      await tx.store.put({ ...row, active: false });
    }
  }
  const record: ConversationSummary = {
    id: uuid(),
    threadId: input.threadId,
    kind: input.kind,
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

/** Both active summaries for a thread (either may be null). */
export async function getActiveSummaries(
  threadId: string,
): Promise<{ history: ConversationSummary | null; tail: ConversationSummary | null }> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('summaries', 'byThread', threadId);
  let history: ConversationSummary | null = null;
  let tail: ConversationSummary | null = null;
  for (const row of rows) {
    if (!row.active) continue;
    if (rowKind(row) === 'tail') tail = row;
    else history = row;
  }
  return { history, tail };
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
