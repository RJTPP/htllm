import { beforeEach, it, expect } from 'vitest';
import { getDb } from '../data/db';
import { exportAllData, importAllData, validateImport } from './export';
const backup = () => ({ version: 1, exportedAt: 1, threads: [{ id: 't', title: 'Test', providerId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1 }], messages: [{ id: 'm', threadId: 't', role: 'assistant', content: 'answer', createdAt: 1, runStatus: 'running' }], settings: [{ key: 'tokenCalibration', value: {} }], promptTemplates: [] });
beforeEach(async () => { const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name); });
it('round-trips summaries without exporting keys and stops imported runs', async () => {
  const data = { ...backup(), summaries: [{ id: 's', threadId: 't', text: 'summary', replacedMessageIds: ['m'], kind: 'history', active: true, generation: 1 }] };
  await importAllData(JSON.stringify(data));
  const db = await getDb(); await db.put('keys', { providerId: 'mcp:secret', value: 'do-not-export' });
  const exported = await exportAllData();
  expect(exported).not.toContain('do-not-export'); expect(JSON.parse(exported).summaries).toHaveLength(1);
  expect((await db.get('messages', 'm'))?.runStatus).toBe('stopped');
});
it('rejects malformed data before replacing existing records', async () => {
  await importAllData(JSON.stringify(backup()));
  await expect(importAllData(JSON.stringify({ ...backup(), messages: [{ id: 'bad' }] }))).rejects.toThrow();
  expect((await getDb()).get('messages', 'm')).resolves.toBeDefined();
});
it('accepts older exports without optional stores', () => { expect(validateImport(JSON.stringify(backup())).version).toBe(1); });
it('preserves the independent automatic RAG preference and rejects non-booleans', async () => {
  const data = backup(); Object.assign(data.threads[0]!, { automaticRagEnabled: false, agentEnabled: true, ragEnabled: true });
  await importAllData(JSON.stringify(data));
  expect(JSON.parse(await exportAllData()).threads[0]).toMatchObject({ automaticRagEnabled: false, agentEnabled: true });
  Object.assign(data.threads[0]!, { automaticRagEnabled: 'yes' });
  expect(() => validateImport(JSON.stringify(data))).toThrow('automatic RAG');
});
it('round-trips exact extracted text and page provenance and rejects malformed originals', async () => {
  const data = { ...backup(), libraries: [{ id: 'lib', name: 'Library', embeddingModelId: '' }], documents: [{ id: 'd', libraryId: 'lib', filename: 'file.pdf', extractedText: 'whole\nfile', pages: [{ page: 1, start: 0, end: 10 }] }] };
  await importAllData(JSON.stringify(data));
  expect(JSON.parse(await exportAllData()).documents[0]).toMatchObject(data.documents[0]!);
  expect(() => validateImport(JSON.stringify({ ...data, documents: [{ ...data.documents[0], extractedText: 42 }] }))).toThrow('extracted');
  expect(() => validateImport(JSON.stringify({ ...data, documents: [{ ...data.documents[0], pages: [{ page: 1, start: 5, end: 2 }] }] }))).toThrow('provenance');
});
it('migrates pre-library exports without discarding document text', async () => {
  await importAllData(JSON.stringify({ ...backup(), documents: [{ id: 'd', filename: 'old.txt' }], chunks: [{ id: 'c', documentId: 'd', text: 'legacy evidence' }] }));
  const db = await getDb(); expect((await db.get('documents', 'd'))?.libraryId).toBe('default');
  expect((await db.get('chunks', 'c'))?.text).toBe('legacy evidence');
});
it('rejects dangling document and thread references', () => {
  expect(() => validateImport(JSON.stringify({ ...backup(), messages: [{ id: 'm', threadId: 'missing', role: 'user', content: 'x' }] }))).toThrow('Orphan');
});
it('clears old credentials when replacing endpoint configuration', async () => {
  const db = await getDb(); await db.put('keys', { providerId: 'mcp:old', value: 'old-secret' });
  await importAllData(JSON.stringify(backup()));
  expect(await db.count('keys')).toBe(0);
});
it('validates nested evidence and tool records before replacement', () => {
  for (const extra of [{ citations: [{ excerpt: 42 }] }, { activity: [{ id: 'x', status: 'running' }] }, { runStatus: 'resume' }]) {
    const data = backup(); Object.assign(data.messages[0]!, extra);
    expect(() => validateImport(JSON.stringify(data))).toThrow();
  }
});
it('type-checks optional thread fields and model parameters', () => {
  const ok = backup(); Object.assign(ok.threads[0]!, { systemPrompt: 'Be brief', folderId: 'f', modelParams: { temperature: 0.7, contextWindow: 8192, reasoningEffort: 'low' } });
  expect(validateImport(JSON.stringify(ok)).version).toBe(1);
  for (const bad of [{ systemPrompt: 3 }, { folderId: {} }, { ragEnabled: 'yes' }, { modelParams: [] }, { modelParams: { temperature: 'hot' } }, { modelParams: { maxTokens: Infinity } }]) {
    const data = backup(); Object.assign(data.threads[0]!, bad);
    expect(() => validateImport(JSON.stringify(data))).toThrow();
  }
});
