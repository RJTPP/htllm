import { expect, it } from 'vitest';
import { openDB } from 'idb';

it('upgrades v9 by marking chats with Tools on as Workspace and adding workspace stores', async () => {
  const old = await openDB('htllm', 9, { upgrade(db) {
    const threads = db.createObjectStore('threads', { keyPath: 'id' }); threads.createIndex('byUpdatedAt', 'updatedAt');
    const messages = db.createObjectStore('messages', { keyPath: 'id' }); messages.createIndex('byThread', 'threadId'); messages.createIndex('byThreadCreated', ['threadId', 'createdAt']);
    for (const name of ['libraries', 'documents', 'chunks', 'parents', 'promptTemplates', 'folders', 'mcpConnections']) db.createObjectStore(name, { keyPath: 'id' });
    db.createObjectStore('summaries', { keyPath: 'id' }).createIndex('byThread', 'threadId');
    db.createObjectStore('keys', { keyPath: 'providerId' }); db.createObjectStore('settings', { keyPath: 'key' }); db.createObjectStore('embeddings', { keyPath: ['chunkId', 'embeddingModelId'] });
  } });
  const base = { providerId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1 };
  await old.put('threads', { id: 'tools-on', title: 'a', ...base, agentEnabled: true, enabledToolIds: ['mcp_x_0'] });
  // Tools ticked but the switch off: becomes Chat (the switch is what turned tools on).
  await old.put('threads', { id: 'ticked-off', title: 'b', ...base, agentEnabled: false, enabledToolIds: ['mcp_x_0'] });
  await old.put('threads', { id: 'plain', title: 'c', ...base });
  await old.put('messages', { id: 'm1', threadId: 'plain', role: 'user', content: 'Keep this', createdAt: 1 });
  old.close();
  const { getDb } = await import('./db'); const db = await getDb();
  expect(db.version).toBe(10);
  expect((await db.get('threads', 'tools-on'))).toMatchObject({ mode: 'workspace', agentEnabled: true, enabledToolIds: ['mcp_x_0'] });
  expect((await db.get('threads', 'ticked-off'))?.mode).toBe('chat');
  expect((await db.get('threads', 'plain'))?.mode).toBe('chat');
  expect((await db.get('messages', 'm1'))?.content).toBe('Keep this');
  expect(db.objectStoreNames.contains('workspaceFiles')).toBe(true);
  expect(db.objectStoreNames.contains('workspaceVersions')).toBe(true);
});
