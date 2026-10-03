import { it, expect } from 'vitest';
import { openDB } from 'idb';
it('upgrades v8 without changing threads or library inheritance', async () => {
  const old = await openDB('htllm', 8, { upgrade(db) {
    const threads = db.createObjectStore('threads', { keyPath: 'id' }); threads.createIndex('byUpdatedAt', 'updatedAt');
    const messages = db.createObjectStore('messages', { keyPath: 'id' }); messages.createIndex('byThread', 'threadId'); messages.createIndex('byThreadCreated', ['threadId', 'createdAt']);
    for (const name of ['libraries', 'documents', 'chunks', 'parents', 'summaries', 'promptTemplates', 'folders']) db.createObjectStore(name, { keyPath: 'id' });
    db.createObjectStore('keys', { keyPath: 'providerId' }); db.createObjectStore('settings', { keyPath: 'key' }); db.createObjectStore('embeddings', { keyPath: ['chunkId', 'embeddingModelId'] });
  } });
  for (const [id, selection] of [['inherit', {}], ['off', { libraryId: null }], ['selected', { libraryId: 'l' }]] as const) await old.put('threads', { id, title: id, providerId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1, ...selection });
  await old.put('messages', { id: 'm', threadId: 'inherit', role: 'user', content: 'Keep this', createdAt: 1 }); old.close();
  const { getDb } = await import('./db'); const current = await getDb();
  expect(current.version).toBe(9); expect(current.objectStoreNames.contains('mcpConnections')).toBe(true);
  expect((await current.get('threads', 'inherit'))?.libraryId).toBeUndefined();
  expect((await current.get('threads', 'off'))?.libraryId).toBeNull();
  expect((await current.get('threads', 'selected'))?.libraryId).toBe('l');
  expect((await current.get('messages', 'm'))?.content).toBe('Keep this');
});
