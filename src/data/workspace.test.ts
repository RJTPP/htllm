import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from './db';
import { createThread, deleteThreadCascade } from './threads';
import { addUpload, countWorkspaceFiles, getWorkspaceFile, getWorkspaceVersion, listWorkspaceFiles, listWorkspaceVersions, writeNote } from './workspace';

beforeEach(async () => { const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name); });
const thread = () => createThread({ title: 't', providerId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1, mode: 'workspace' });

describe('workspace data', () => {
  it('creates notes and records every version in order', async () => {
    const t = await thread();
    const v1 = await writeNote({ threadId: t.id, path: '/notes/a.md', text: 'one', change: 'write', messageId: 'msg1' });
    const v2 = await writeNote({ threadId: t.id, path: '/notes/a.md', text: 'two', change: 'edit', expectedVersion: 1 });
    expect([v1.version, v2.version, v2.id]).toEqual([1, 2, v1.id]);
    expect((await getWorkspaceFile(t.id, '/notes/a.md'))?.text).toBe('two');
    expect((await listWorkspaceVersions(v1.id)).map((v) => [v.version, v.change, v.text])).toEqual([[1, 'create', 'one'], [2, 'edit', 'two']]);
    expect((await getWorkspaceVersion(v1.id, 1))?.messageId).toBe('msg1');
  });
  it('rejects stale writes and writes over uploads', async () => {
    const t = await thread();
    await writeNote({ threadId: t.id, path: '/notes/a.md', text: 'one', change: 'write' });
    await expect(writeNote({ threadId: t.id, path: '/notes/a.md', text: 'x', change: 'edit', expectedVersion: 0 })).rejects.toThrow('changed since it was read');
    await addUpload({ threadId: t.id, path: '/uploads/r.txt', text: 'source', mimeType: 'text/plain' });
    await expect(writeNote({ threadId: t.id, path: '/uploads/r.txt', text: 'x', change: 'write' })).rejects.toThrow('read-only');
    await expect(addUpload({ threadId: t.id, path: '/uploads/r.txt', text: 'dup', mimeType: 'text/plain' })).rejects.toThrow();
  });
  it('keeps files per chat and deletes them with the chat', async () => {
    const a = await thread(); const b = await thread();
    await writeNote({ threadId: a.id, path: '/notes/x.md', text: 'a', change: 'write' });
    await writeNote({ threadId: b.id, path: '/notes/x.md', text: 'b', change: 'write' });
    expect(await countWorkspaceFiles(a.id)).toBe(1);
    await deleteThreadCascade(a.id);
    expect(await listWorkspaceFiles(a.id)).toEqual([]);
    const db = await getDb();
    expect((await db.getAll('workspaceVersions')).every((v) => v.threadId === b.id)).toBe(true);
    expect((await listWorkspaceFiles(b.id))[0]?.text).toBe('b');
  });
});
