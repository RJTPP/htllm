import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../data/db';
import { listWorkspaceFiles } from '../data/workspace';

vi.mock('../lib/pdf', () => ({
  extractPdf: vi.fn(async () => ({ text: 'Page one\n\nPage two', pages: [{ page: 1, start: 0, end: 8 }, { page: 2, start: 10, end: 18 }] })),
}));
const { uploadToWorkspace, UPLOAD_ACCEPT } = await import('./workspace-upload');

beforeEach(async () => { const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name); await db.put('threads', { id: 't', title: 't', providerId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1, mode: 'workspace' }); });

describe('uploadToWorkspace', () => {
  it('stores text files read-only under /uploads and de-duplicates names', async () => {
    const a = await uploadToWorkspace('t', new File(['hello'], 'notes.md', { type: 'text/markdown' }));
    const b = await uploadToWorkspace('t', new File(['again'], 'notes.md', { type: 'text/markdown' }));
    expect([a.path, a.kind, b.path]).toEqual(['/uploads/notes.md', 'upload', '/uploads/notes (2).md']);
    const c = await uploadToWorkspace('t', new File(['{"a":1}'], 'data.json', { type: '' }));
    expect(c.text).toBe('{"a":1}');
  });
  it('keeps PDF page offsets and sanitizes names', async () => {
    const pdf = await uploadToWorkspace('t', new File(['%PDF'], '../evil/report.pdf', { type: 'application/pdf' }));
    expect(pdf).toMatchObject({ path: '/uploads/-evil-report.pdf', mimeType: 'application/pdf', pages: [{ page: 1, start: 0, end: 8 }, { page: 2, start: 10, end: 18 }] });
  });
  it('refuses unsupported, empty and oversized files', async () => {
    await expect(uploadToWorkspace('t', new File([new Uint8Array([1, 2])], 'photo.png', { type: 'image/png' }))).rejects.toThrow('not supported');
    await expect(uploadToWorkspace('t', new File(['   '], 'blank.txt', { type: 'text/plain' }))).rejects.toThrow('no readable text');
    const big = new File(['x'], 'big.txt', { type: 'text/plain' }); Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    await expect(uploadToWorkspace('t', big)).rejects.toThrow('larger than');
    expect(await listWorkspaceFiles('t')).toEqual([]);
    expect(UPLOAD_ACCEPT).toContain('.pdf');
  });
});
