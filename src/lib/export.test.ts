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
