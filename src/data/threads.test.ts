import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, STORE_NAMES } from './db';
import { createThread, deleteThreadCascade } from './threads';

beforeEach(async () => { const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name); });

describe('deleteThreadCascade', () => {
  it('removes the thread with its messages and summaries, leaving other threads intact', async () => {
    const db = await getDb();
    const a = await createThread({ title: 'A', providerId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1 });
    const b = await createThread({ title: 'B', providerId: 'p', modelId: 'm', createdAt: 2, updatedAt: 2 });
    for (const [id, threadId] of [['m1', a.id], ['m2', a.id], ['m3', b.id]] as const) {
      await db.put('messages', { id, threadId, role: 'user', content: 'hi', createdAt: 1 });
    }
    await db.put('summaries', { id: 's1', threadId: a.id, text: 'sum', replacedMessageIds: [], kind: 'history', active: true, generation: 1 } as never);
    await deleteThreadCascade(a.id);
    expect(await db.get('threads', a.id)).toBeUndefined();
    expect((await db.getAll('messages')).map((m) => m.id)).toEqual(['m3']);
    expect(await db.getAll('summaries')).toHaveLength(0);
    expect(await db.get('threads', b.id)).toBeDefined();
  });
});

describe('STORE_NAMES', () => {
  it('lists every object store in the schema', async () => {
    const db = await getDb();
    expect([...STORE_NAMES].sort()).toEqual([...db.objectStoreNames].sort());
  });
});
