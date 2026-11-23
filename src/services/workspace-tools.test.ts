import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../data/db';
import { addUpload, writeNote } from '../data/workspace';
import { contextBand } from '../lib/workspace-text';
import { mountWorkspace, workspaceReadTools, type WorkspaceContext } from './workspace-tools';

const signal = new AbortController().signal;
let ctx: WorkspaceContext;
const tool = (name: string) => workspaceReadTools(ctx).find((t) => t.name === name)!;

beforeEach(async () => {
  const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name);
  await db.put('threads', { id: 't', title: 't', providerId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1, mode: 'workspace' });
  await db.put('libraries', { id: 'lib', name: 'Team/Docs', embeddingModelId: '', createdAt: 1 });
  await db.put('documents', { id: 'doc', libraryId: 'lib', filename: 'plan.txt', mimeType: 'text/plain', sizeBytes: 9, chunkCount: 0, createdAt: 1, extractedText: 'Atlas launches on November 12.\nBudget is fixed.', pages: [{ page: 4, start: 0, end: 47 }] });
  await addUpload({ threadId: 't', path: '/uploads/report.txt', text: 'Intro\nAtlas risks: weather.\nEnd', mimeType: 'text/plain' });
  await writeNote({ threadId: 't', path: '/notes/todo.md', text: 'check Atlas date', change: 'write' });
  ctx = { threadId: 't', libraryId: 'lib', band: contextBand(8192), readVersions: new Map() };
});

describe('workspace read tools', () => {
  it('mounts uploads, notes and the attached library read-only under safe names', async () => {
    const paths = (await mountWorkspace(ctx)).map((f) => `${f.path}:${f.kind}`);
    expect(paths).toEqual(['/library/Team-Docs/plan.txt:library', '/notes/todo.md:note', '/uploads/report.txt:upload']);
    const listed = (await tool('list_files').execute({}, signal)).text;
    expect(listed).toContain('/uploads/report.txt  (upload, read-only');
    expect(listed).toContain('/notes/todo.md  (note, v1');
    expect((await tool('list_files').execute({ path: '/notes' }, signal)).text).not.toContain('/uploads');
  });
  it('reads uploads and library files as citable line ranges with pages', async () => {
    const read = await tool('read_file').execute({ path: '/library/Team-Docs/plan.txt' }, signal);
    expect(read.text).toMatch(/^Source ID: doc:L1-2\n<\/library\/Team-Docs\/plan.txt>\n--- page 4 ---\n1: Atlas launches/);
    expect(read.citations?.[0]).toMatchObject({ id: 'doc:L1-2', documentId: 'doc', lineStart: 1, lineEnd: 2, pageStart: 4, excerpt: 'Atlas launches on November 12.\nBudget is fixed.' });
    const partial = await tool('read_file').execute({ path: 'report.txt'.replace(/^/, '/uploads/'), offset: 2, limit: 1 }, signal);
    expect(partial.text).toContain('2: Atlas risks: weather.');
    expect(partial.text).toContain('Use offset=3 to continue.');
  });
  it('never cites the model\'s own notes and records read versions', async () => {
    const read = await tool('read_file').execute({ path: 'todo.md' }, signal);
    expect(read.citations).toBeUndefined();
    expect(read.text).toContain('not evidence');
    expect(ctx.readVersions.get('/notes/todo.md')).toBe(1);
  });
  it('refuses paths outside the workspace and suggests near matches', async () => {
    await expect(tool('read_file').execute({ path: '/notes/../uploads/report.txt' }, signal)).rejects.toThrow('may not contain');
    await expect(tool('read_file').execute({ path: '/uploads/report' }, signal)).rejects.toThrow('Did you mean: /uploads/report.txt');
  });
  it('searches by keyword when the library is not indexed, citing evidence but not notes', async () => {
    const result = await tool('search').execute({ query: 'Atlas date' }, signal);
    expect(result.text).toContain('/notes/todo.md:1 (your note)');
    expect(result.text).toMatch(/\/library\/Team-Docs\/plan.txt:1 \[Source ID: doc:L1-1\]/);
    expect(result.citations?.every((c) => !c.filename.startsWith('/notes'))).toBe(true);
  });
  it('greps exact text within a scope', async () => {
    expect((await tool('grep').execute({ pattern: 'Atlas', path: '/uploads' }, signal)).text).toBe('/uploads/report.txt:2: Atlas risks: weather.');
    expect((await tool('grep').execute({ pattern: 'missing' }, signal)).text).toContain('No lines match');
    await expect(tool('grep').execute({ pattern: '(a+)+', regex: true }, signal)).rejects.toThrow('Nested quantifiers');
  });
  it('keeps tool definitions small enough for 8k-context models', () => {
    const size = JSON.stringify(workspaceReadTools(ctx).map(({ name, description, parameters }) => ({ name, description, parameters }))).length;
    expect(size).toBeLessThan(3200);
  });
});
