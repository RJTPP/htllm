import { describe, it, expect } from 'vitest';
import {
  saveSummary,
  getActiveSummaries,
  getThreadSummaries,
  type NewSummary,
} from './summaries';

let n = 0;
const newThread = () => `thread-${n++}`;

function base(threadId: string, kind: 'history' | 'tail'): NewSummary {
  return {
    threadId,
    kind,
    text: `${kind} summary`,
    replacedMessageIds: ['m1', 'm2'],
    replacedTokens: 100,
    summaryTokens: 20,
    source: 'auto',
  };
}

describe('summaries data layer', () => {
  it('saves a history summary and reads it back as active', async () => {
    const t = newThread();
    const saved = await saveSummary(base(t, 'history'));
    expect(saved.kind).toBe('history');
    expect(saved.active).toBe(true);
    expect(saved.generation).toBe(1);

    const { history, tail } = await getActiveSummaries(t);
    expect(history?.id).toBe(saved.id);
    expect(tail).toBeNull();
  });

  it('re-compaction supersedes the prior record but retains it', async () => {
    const t = newThread();
    await saveSummary(base(t, 'history'));
    const second = await saveSummary({
      ...base(t, 'history'),
      replacedMessageIds: ['m1', 'm2', 'm3', 'm4'],
    });

    // generation increments; only the latest is active.
    expect(second.generation).toBe(2);
    const { history } = await getActiveSummaries(t);
    expect(history?.id).toBe(second.id);
    expect(history?.generation).toBe(2);

    // BUT both records are retained (this is what drives the persistent
    // per-event UI dividers).
    const all = await getThreadSummaries(t);
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.generation).sort()).toEqual([1, 2]);
  });

  it('tracks history and tail kinds independently', async () => {
    const t = newThread();
    const h = await saveSummary(base(t, 'history'));
    const tl = await saveSummary(base(t, 'tail'));

    const { history, tail } = await getActiveSummaries(t);
    expect(history?.id).toBe(h.id);
    expect(tail?.id).toBe(tl.id);
    // saving a tail does not deactivate the history record.
    expect(history?.active).toBe(true);
    expect(tail?.active).toBe(true);
  });

  it('getThreadSummaries returns all records sorted by createdAt', async () => {
    const t = newThread();
    const a = await saveSummary(base(t, 'history'));
    const b = await saveSummary(base(t, 'history'));
    const all = await getThreadSummaries(t);
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    // Non-decreasing createdAt (tie order for same-ms saves is unspecified).
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.createdAt).toBeGreaterThanOrEqual(all[i - 1]!.createdAt);
    }
  });

  it('isolates summaries per thread', async () => {
    const t1 = newThread();
    const t2 = newThread();
    await saveSummary(base(t1, 'history'));
    expect(await getThreadSummaries(t2)).toHaveLength(0);
  });
});
