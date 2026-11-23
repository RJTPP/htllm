import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../data/db';
import { addUpload, writeNote } from '../data/workspace';
import { contextBand } from '../lib/workspace-text';
import { locateEdit, mountWorkspace, workspaceReadTools, workspaceSummary, workspaceTools, type WorkspaceContext } from './workspace-tools';

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
  ctx = { threadId: 't', libraryIds: ['lib'], band: contextBand(8192), readVersions: new Map() };
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

describe('workspace write tools', () => {
  const all = () => workspaceTools(ctx);
  const run = (name: string, args: Record<string, unknown>) => all().find((t) => t.name === name)!.execute(args, signal);
  it('creates notes under /notes only and refuses read-only places', async () => {
    expect((await run('write_file', { path: 'summary.md', content: '# Summary' })).text).toBe('Created /notes/summary.md (v1, 9 characters).');
    await expect(run('write_file', { path: '/uploads/report.txt', content: 'x' })).rejects.toThrow('only write under /notes');
    await expect(run('write_file', { path: '/library/Team-Docs/plan.txt', content: 'x' })).rejects.toThrow('read-only');
    await expect(run('write_file', { path: '/notes/../uploads/x', content: 'x' })).rejects.toThrow('may not contain');
  });
  it('requires a current read before changing an existing note', async () => {
    await expect(run('write_file', { path: '/notes/todo.md', content: 'new' })).rejects.toThrow('Read it with read_file');
    await run('read_file', { path: '/notes/todo.md' });
    await writeNote({ threadId: 't', path: '/notes/todo.md', text: 'user changed it', change: 'user' });
    await expect(run('write_file', { path: '/notes/todo.md', content: 'new' })).rejects.toThrow('changed since you read it (you read v1, it is now v2)');
    await run('read_file', { path: '/notes/todo.md' });
    expect((await run('write_file', { path: '/notes/todo.md', content: 'new' })).text).toContain('Updated /notes/todo.md (v3');
    // A note written this turn counts as read.
    expect((await run('write_file', { path: '/notes/todo.md', content: 'newer' })).text).toContain('(v4');
  });
  it('edits exact text once, refuses ambiguity, and tolerates indentation only', async () => {
    await run('write_file', { path: '/notes/e.md', content: '- a\n  - item\n- a\n' });
    await expect(run('edit_file', { path: '/notes/e.md', old_string: '- a', new_string: '- b' })).rejects.toThrow('appears 2 times');
    expect((await run('edit_file', { path: '/notes/e.md', old_string: '- a', new_string: '- b', replace_all: true })).text).toContain('v2');
    expect((await run('edit_file', { path: '/notes/e.md', old_string: '- item', new_string: '- thing' })).text).toContain('v3');
    expect((await mountWorkspace(ctx)).find((f) => f.path === '/notes/e.md')?.text).toBe('- b\n  - thing\n- b\n');
    await expect(run('edit_file', { path: '/notes/e.md', old_string: 'absent', new_string: 'x' })).rejects.toThrow('not found');
  });
  it('copies exact line ranges with provenance and never cites the copy', async () => {
    const out = await run('copy_file', { source: '/library/Team-Docs/plan.txt', destination: '/notes/excerpt.md', start_line: 2, end_line: 2 });
    expect(out.text).toContain('lines 2-2 to /notes/excerpt.md');
    const copy = (await mountWorkspace(ctx)).find((f) => f.path === '/notes/excerpt.md')!;
    expect(copy.text).toBe('Budget is fixed.');
    expect(copy.file?.copiedFrom).toMatchObject({ path: '/library/Team-Docs/plan.txt', startLine: 2, endLine: 2, pageStart: 4 });
    expect((await run('read_file', { path: '/notes/excerpt.md' })).citations).toBeUndefined();
    await expect(run('copy_file', { source: '/uploads/report.txt', destination: '/uploads/again.txt' })).rejects.toThrow('only write under /notes');
  });
  it('presents notes and uploads at their current version, but not library files', async () => {
    const out = await run('present_file', { path: '/notes/todo.md', caption: ' Plan ' });
    expect(out.presented).toMatchObject({ path: '/notes/todo.md', version: 1, caption: 'Plan' });
    expect((await run('present_file', { path: '/uploads/report.txt' })).presented?.version).toBe(1);
    await expect(run('present_file', { path: '/library/Team-Docs/plan.txt' })).rejects.toThrow('cannot be presented');
  });
  it('keeps the default tool definitions within a small-context budget', () => {
    const defs = all().map(({ name, description, parameters }) => ({ name, description, parameters }));
    expect(defs.map((d) => d.name)).toEqual(['list_files', 'read_file', 'search', 'grep', 'write_file', 'edit_file', 'copy_file', 'present_file', 'calculate']);
    // ≈1.7k tokens at 4 characters per token: about a fifth of an 8k window.
    expect(JSON.stringify(defs).length).toBeLessThan(7000);
    expect(workspaceTools(ctx, { csv: true }).at(-1)?.name).toBe('query_csv');
  });
  it('calculates exactly and queries CSV uploads', async () => {
    expect((await run('calculate', { expression: '600 / 4' })).text).toBe('600 / 4 = 150');
    await expect(run('calculate', { expression: 'alert(1)' })).rejects.toThrow('Unknown name');
    await addUpload({ threadId: 't', path: '/uploads/gear.csv', text: 'item,price\nTent,200\nStove,45', mimeType: 'text/csv' });
    const q = workspaceTools(ctx, { csv: true }).find((t) => t.name === 'query_csv')!;
    const out = await q.execute({ path: '/uploads/gear.csv', aggregate: { fn: 'sum', column: 'price' } }, signal);
    expect(out.text).toContain('/uploads/gear.csv: 2 of 2 rows matched.');
    expect(out.text).toContain('| 245 |');
    await expect(q.execute({ path: '/uploads/report.txt' }, signal)).rejects.toThrow('not a CSV');
  });
});

describe('locateEdit', () => {
  it('refuses a whitespace-tolerant match much larger than the request', () => {
    expect(locateEdit('a\n\n\n\nb', 'a\nb').count).toBe(0);
    expect(locateEdit('  x = 1\n  y = 2', 'x = 1\ny = 2')).toMatchObject({ count: 1, fuzzy: true, start: 0 });
  });
});

describe('workspaceSummary', () => {
  it('lists files for the prompt, capped', async () => {
    const summary = await workspaceSummary(ctx);
    expect(summary).toContain('- /uploads/report.txt (upload, read-only');
    expect(summary).toContain('- /notes/todo.md (note v1');
    expect(summary).toContain('/library/Team-Docs/plan.txt (library, read-only');
    expect(await workspaceSummary(ctx, 1)).toContain('…and 2 more');
  });
});

describe('several attached libraries', () => {
  it('mounts each library under its own folder, de-duplicating names, and searches all of them', async () => {
    const db = await getDb();
    await db.put('libraries', { id: 'lib2', name: 'Team/Docs', embeddingModelId: '', createdAt: 2 });
    await db.put('documents', { id: 'doc2', libraryId: 'lib2', filename: 'risks.txt', mimeType: 'text/plain', sizeBytes: 9, chunkCount: 0, createdAt: 1, extractedText: 'Atlas risk: supplier delay.' });
    const multi: WorkspaceContext = { ...ctx, libraryIds: ['lib', 'lib2', 'lib', 'missing'] };
    const paths = (await mountWorkspace(multi)).filter((f) => f.kind === 'library').map((f) => `${f.path}:${f.libraryId}`);
    expect(paths).toEqual(['/library/Team-Docs (2)/risks.txt:lib2', '/library/Team-Docs/plan.txt:lib']);
    const found = await workspaceReadTools(multi).find((t) => t.name === 'search')!.execute({ query: 'Atlas' }, signal);
    expect(found.text).toContain('/library/Team-Docs (2)/risks.txt:1');
    expect(found.text).toContain('/library/Team-Docs/plan.txt:1');
  });
});
