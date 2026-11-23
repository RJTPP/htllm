import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from './db';
import { createThread, deleteThreadCascade } from './threads';
import { addUpload, countWorkspaceFiles, getWorkspaceFile, getWorkspaceVersion, listWorkspaceFiles, listWorkspaceVersions, versionsByMessages, writeNote } from './workspace';

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

describe('versionsByMessages', () => {
  it('reports the latest version each removed reply made, per file', async () => {
    const t = await thread();
    await writeNote({ threadId: t.id, path: '/notes/a.md', text: '1', change: 'write', messageId: 'r1' });
    await writeNote({ threadId: t.id, path: '/notes/a.md', text: '2', change: 'edit', messageId: 'r2' });
    await writeNote({ threadId: t.id, path: '/notes/a.md', text: '3', change: 'edit', messageId: 'r2' });
    await writeNote({ threadId: t.id, path: '/notes/b.md', text: 'b', change: 'write', messageId: 'r1' });
    expect(await versionsByMessages(t.id, ['r2'])).toEqual([{ path: '/notes/a.md', version: 3 }]);
    expect(await versionsByMessages(t.id, ['r1'])).toEqual([{ path: '/notes/a.md', version: 1 }, { path: '/notes/b.md', version: 1 }]);
    expect(await versionsByMessages(t.id, [])).toEqual([]);
  });
});

describe('chat existence', () => {
  it('refuses uploads and note writes for a chat that was deleted meanwhile', async () => {
    const t = await thread();
    await deleteThreadCascade(t.id);
    await expect(addUpload({ threadId: t.id, path: '/uploads/late.txt', text: 'x', mimeType: 'text/plain' })).rejects.toThrow('no longer exists');
    await expect(writeNote({ threadId: t.id, path: '/notes/late.md', text: 'x', change: 'write' })).rejects.toThrow('no longer exists');
    const db = await getDb();
    expect(await db.getAll('workspaceFiles')).toEqual([]);
    expect(await db.getAll('workspaceVersions')).toEqual([]);
  });
});

describe('note metadata', () => {
  it('stores a MIME type matching the extension and keeps copy provenance per version', async () => {
    const t = await thread();
    expect((await writeNote({ threadId: t.id, path: '/notes/data.json', text: '{}', change: 'write' })).mimeType).toBe('application/json');
    const a = { path: '/uploads/a.txt', startLine: 1, endLine: 2 };
    const b = { path: '/uploads/b.txt', startLine: 5, endLine: 9 };
    const v1 = await writeNote({ threadId: t.id, path: '/notes/c.md', text: 'from a', change: 'copy', copiedFrom: a });
    await writeNote({ threadId: t.id, path: '/notes/c.md', text: 'from b', change: 'copy', copiedFrom: b });
    const v3 = await writeNote({ threadId: t.id, path: '/notes/c.md', text: 'rewritten', change: 'write' });
    expect((await getWorkspaceVersion(v1.id, 1))?.copiedFrom).toEqual(a);
    expect((await getWorkspaceVersion(v1.id, 2))?.copiedFrom).toEqual(b);
    expect((await getWorkspaceVersion(v1.id, 3))?.copiedFrom).toBeUndefined();
    expect(v3.copiedFrom).toBeUndefined();
  });
});
