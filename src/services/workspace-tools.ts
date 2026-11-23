import type { SourceCitation, WorkspaceFile } from '../providers/types';
import type { ExecutableTool } from './tools';
import { listWorkspaceFiles, writeNote } from '../data/workspace';
import { listDocumentsByLibrary } from '../data/documents';
import { getChunksForDocument } from '../data/chunks';
import { getLibrary } from '../data/libraries';
import { retrieve } from './retrieval';
import { normalizeWorkspacePath } from '../lib/workspace-path';
import { grepFiles, lexicalSearch, lineSpans, pageAt, readWindow, snippet, type Band, type Pages } from '../lib/workspace-text';

export interface WorkspaceContext {
  threadId: string;
  libraryId: string | null;
  band: Band;
  /** Assistant message of this turn; recorded on note versions it creates. */
  messageId?: string;
  /** Versions this turn has read, by path. write/edit require a current read. */
  readVersions: Map<string, number>;
}

/** A file as the model sees it: workspace files plus the attached library. */
export interface Mounted {
  path: string;
  kind: 'upload' | 'note' | 'library';
  /** Workspace file id, or Document id for library files. */
  id: string;
  text: string;
  pages?: Pages;
  version: number;
  /** Library documents imported before exact text was kept. */
  legacy?: boolean;
  file?: WorkspaceFile;
}

const segment = (name: string) => name.replace(/[\\/\u0000-\u001f\u007f]/g, '-').trim() || 'untitled';

/** Mount the chat's files and the attached library (read-only) as one tree. */
export async function mountWorkspace(ctx: Pick<WorkspaceContext, 'threadId' | 'libraryId'>): Promise<Mounted[]> {
  const files: Mounted[] = (await listWorkspaceFiles(ctx.threadId)).map((file) => ({
    path: file.path, kind: file.kind, id: file.id, text: file.text, pages: file.pages, version: file.version, file,
  }));
  if (ctx.libraryId) {
    const library = await getLibrary(ctx.libraryId);
    const root = `/library/${segment(library?.name ?? 'library')}`;
    const taken = new Set<string>();
    for (const doc of await listDocumentsByLibrary(ctx.libraryId)) {
      let path = `${root}/${segment(doc.filename)}`;
      for (let n = 2; taken.has(path); n++) path = `${root}/${segment(doc.filename)} (${n})`;
      taken.add(path);
      const legacy = typeof doc.extractedText !== 'string';
      const text = doc.extractedText ?? (await getChunksForDocument(doc.id)).map((c) => c.text).join('\n\n');
      files.push({ path, kind: 'library', id: doc.id, text, pages: legacy ? undefined : doc.pages, version: 1, legacy });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Resolve a model-supplied path to a mounted file, with a helpful error. */
export function findMounted(files: Mounted[], input: string): Mounted {
  const path = normalizeWorkspacePath(input);
  const file = files.find((f) => f.path === path);
  if (file) return file;
  const near = files.filter((f) => f.path.toLowerCase().includes(path.split('/').pop()!.toLowerCase())).slice(0, 3).map((f) => f.path);
  throw new Error(`No file at ${path}.${near.length ? ` Did you mean: ${near.join(', ')}?` : ' Use list_files to see what exists.'}`);
}

/** Built-in Workspace tools as shown in the Tools panel. */
export const WORKSPACE_TOOL_SUMMARY: readonly (readonly [string, string])[] = [
  ['list_files', 'List uploads, notes and library files'],
  ['read_file', 'Read a file by line range'],
  ['search', 'Find passages by meaning and keywords'],
  ['grep', 'Find exact text'],
  ['write_file', 'Create or replace a note'],
  ['edit_file', 'Change exact text in a note'],
  ['copy_file', 'Copy a file or lines into a note'],
  ['present_file', 'Hand a finished file to you'],
];

/** D-18: uploads and library documents are evidence; the model's notes are not. */
const citable = (file: Mounted) => file.kind !== 'note';

function lineCitation(file: Mounted, startLine: number, endLine: number, excerpt: string): SourceCitation {
  const spans = lineSpans(file.text);
  const id = `${file.id}:L${startLine}-${endLine}`;
  return { id, chunkId: id, documentId: file.id, filename: file.path, excerpt, lineStart: startLine, lineEnd: endLine,
    pageStart: pageAt(file.pages, spans[startLine - 1]?.start ?? 0), pageEnd: pageAt(file.pages, spans[endLine - 1]?.start ?? 0) };
}

/** Line number (1-based, shared line model) containing a character offset. */
function lineAt(text: string, offset: number): number {
  const spans = lineSpans(text);
  const i = spans.findIndex((s) => offset >= s.start && offset <= s.end);
  return i < 0 ? 1 : i + 1;
}

const fmtSize = (n: number) => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
const object = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });

/** The read side of the Workspace tool set (list, read, search, grep). */
export function workspaceReadTools(ctx: WorkspaceContext): ExecutableTool[] {
  const load = () => mountWorkspace(ctx);
  return [
    {
      name: 'list_files',
      description: 'List files in this chat\'s workspace: /uploads (user files, read-only), /notes (yours), /library (attached knowledge, read-only).',
      parameters: object({ path: { type: 'string', description: 'Folder to list, e.g. /notes. Default: everything.' } }, []),
      execute: async (args) => {
        const files = await load();
        const prefix = typeof args.path === 'string' && args.path.trim() && args.path.trim() !== '/' ? normalizeWorkspacePath(args.path) : '';
        const shown = files.filter((f) => !prefix || f.path === prefix || f.path.startsWith(`${prefix}/`));
        if (!shown.length) return { text: prefix ? `Nothing under ${prefix}.` : 'The workspace is empty. The user can attach files; you can write notes under /notes.' };
        return { text: shown.map((f) => `${f.path}  (${f.kind === 'note' ? `note, v${f.version}` : f.kind === 'upload' ? 'upload, read-only' : 'library, read-only'}, ${fmtSize(f.text.length)}${f.legacy ? ', legacy chunks only' : ''})`).join('\n') };
      },
    },
    {
      name: 'read_file',
      description: 'Read a file by line range. Output lines are "N: text". Follow the "Use offset=N to continue" hint to read further.',
      parameters: object({
        path: { type: 'string' },
        offset: { type: 'integer', minimum: 1, description: 'First line to read (1-based). Default 1.' },
        limit: { type: 'integer', minimum: 1, description: `Lines to read. Default and maximum ${ctx.band.lines}.` },
      }, ['path']),
      execute: async (args, signal, maxChars) => {
        const file = findMounted(await load(), String(args.path));
        signal.throwIfAborted();
        const limit = Math.min(ctx.band.lines, typeof args.limit === 'number' ? args.limit : ctx.band.lines);
        const window = readWindow(file.path, file.text, file.pages, typeof args.offset === 'number' ? args.offset : 1, limit, Math.min(ctx.band.chars, maxChars ?? ctx.band.chars));
        ctx.readVersions.set(file.path, file.version);
        if (!citable(file) || window.endLine < window.startLine) return { text: window.output + (file.kind === 'note' ? '\n(Your note: not evidence, do not cite it.)' : '') };
        const citation = lineCitation(file, window.startLine, window.endLine, window.excerpt);
        return { text: `Source ID: ${citation.id}\n${window.output}${file.legacy ? '\n(Legacy import: text rebuilt from search chunks; reimport for the exact original.)' : ''}`, citations: [citation] };
      },
    },
    {
      name: 'search',
      description: 'Search files by meaning and keywords. Use for questions; use grep for exact text. Returns path:line matches.',
      parameters: object({ query: { type: 'string', minLength: 1, maxLength: 500 }, path: { type: 'string', description: 'Limit to a folder or file.' } }, ['query']),
      execute: async (args, signal, maxChars) => {
        const files = await load();
        const prefix = typeof args.path === 'string' && args.path.trim() ? normalizeWorkspacePath(args.path) : '';
        const inScope = (p: string) => !prefix || p === prefix || p.startsWith(`${prefix}/`);
        const lines: string[] = []; const citations: SourceCitation[] = [];
        let semantic = false;
        // Indexed libraries: the same hybrid engine as Automatic RAG (D-15).
        if (ctx.libraryId && files.some((f) => f.kind === 'library' && inScope(f.path))) {
          try {
            const result = await retrieve(ctx.libraryId, String(args.query), signal, Math.min(4000, ctx.band.chars));
            semantic = true;
            for (const hit of result.citations) {
              const file = files.find((f) => f.kind === 'library' && f.id === hit.documentId);
              if (!file || !inScope(file.path)) continue;
              const at = file.text.indexOf(hit.excerpt.slice(0, 120));
              const startLine = at < 0 ? 1 : lineAt(file.text, at);
              const endLine = at < 0 ? 1 : lineAt(file.text, at + hit.excerpt.length);
              const citation = { ...lineCitation(file, startLine, endLine, hit.excerpt), pageStart: hit.pageStart, pageEnd: hit.pageEnd };
              citations.push(citation);
              lines.push(`${file.path}:${startLine}${hit.pageStart ? ` (p. ${hit.pageStart})` : ''} [Source ID: ${citation.id}]\n  ${snippet(hit.excerpt, 300)}`);
            }
          } catch { /* not indexed or no embedding provider: keyword search covers it below */ }
        }
        const keywordFiles = files.filter((f) => inScope(f.path) && !(semantic && f.kind === 'library'));
        for (const hit of lexicalSearch(keywordFiles, String(args.query), 10)) {
          const file = keywordFiles.find((f) => f.path === hit.path)!;
          if (citable(file)) {
            const citation = lineCitation(file, hit.line, hit.line, hit.text);
            citations.push(citation);
            lines.push(`${hit.path}:${hit.line} [Source ID: ${citation.id}]\n  ${snippet(hit.text)}`);
          } else lines.push(`${hit.path}:${hit.line} (your note)\n  ${snippet(hit.text)}`);
        }
        if (!lines.length) return { text: 'No matches. Try other words, grep for exact text, or list_files.', citations: [] };
        let text = ''; const kept: SourceCitation[] = [];
        const cap = Math.min(ctx.band.chars, maxChars ?? ctx.band.chars) - 120;
        for (const [i, line] of lines.entries()) {
          if (text.length + line.length + 1 > cap) { text += `\n(${lines.length - i} more matches not shown. Narrow the query or path.)`; break; }
          text += (text ? '\n' : '') + line;
          const id = /Source ID: ([^\]]+)\]/.exec(line)?.[1];
          const citation = citations.find((c) => c.id === id); if (citation) kept.push(citation);
        }
        return { text, citations: kept };
      },
    },
    {
      name: 'grep',
      description: 'Find exact text (or a simple regular expression with regex=true) in files. Returns path:line: text.',
      parameters: object({
        pattern: { type: 'string', minLength: 1, maxLength: 200 },
        path: { type: 'string', description: 'Limit to a folder or file.' },
        regex: { type: 'boolean' },
        ignoreCase: { type: 'boolean' },
      }, ['pattern']),
      execute: async (args, _signal, maxChars) => {
        const files = await load();
        const prefix = typeof args.path === 'string' && args.path.trim() ? normalizeWorkspacePath(args.path) : '';
        const scope = files.filter((f) => !prefix || f.path === prefix || f.path.startsWith(`${prefix}/`));
        const { hits, more } = grepFiles(scope, String(args.pattern), { regex: args.regex === true, ignoreCase: args.ignoreCase === true });
        if (!hits.length) return { text: `No lines match ${JSON.stringify(args.pattern)}${prefix ? ` under ${prefix}` : ''}.` };
        const cap = Math.min(ctx.band.chars, maxChars ?? ctx.band.chars) - 120;
        let text = ''; let shown = 0;
        for (const hit of hits) {
          const line = `${hit.path}:${hit.line}: ${snippet(hit.text, 300)}`;
          if (text.length + line.length + 1 > cap) break;
          text += (text ? '\n' : '') + line; shown++;
        }
        const hidden = hits.length - shown + more;
        return { text: hidden ? `${text}\n(${hidden} more matches not shown. Narrow the pattern or path.)` : text };
      },
    },
  ];
}

/** Largest note a single write may produce (matches the agent's argument cap). */
const MAX_NOTE_CHARS = 64000;

/** Resolve a destination for writing: only under /notes (D-17). */
function notePath(input: unknown): string {
  const path = normalizeWorkspacePath(String(input));
  if (!path.startsWith('/notes/')) throw new Error(`You can only write under /notes. ${path} is read-only (uploads and library files belong to the user).`);
  return path;
}

/**
 * A write over an existing note needs this turn to have read its current
 * version, so the model never overwrites text it has not seen, including a
 * change the user made while the chat ran.
 */
function requireCurrentRead(ctx: WorkspaceContext, file: Mounted | undefined, path: string) {
  if (!file) return undefined;
  const read = ctx.readVersions.get(path);
  if (read === undefined) throw new Error(`${path} already exists. Read it with read_file before changing it.`);
  if (read !== file.version) throw new Error(`${path} changed since you read it (you read v${read}, it is now v${file.version}). Read it again before changing it.`);
  return file.version;
}

/** Find `old` in `text`: exactly, or, if absent, line by line ignoring indentation and trailing spaces. */
export function locateEdit(text: string, old: string): { start: number; end: number; count: number; fuzzy: boolean } {
  let count = 0; let first = -1;
  for (let i = text.indexOf(old); i !== -1; i = text.indexOf(old, i + Math.max(1, old.length))) { if (first < 0) first = i; count++; }
  if (count) return { start: first, end: first + old.length, count, fuzzy: false };
  const wanted = old.split('\n').map((l) => l.trim());
  while (wanted.length && wanted.at(-1) === '') wanted.pop();
  if (!wanted.length) return { start: -1, end: -1, count: 0, fuzzy: true };
  const lines = text.split('\n');
  const offsets: number[] = []; let at = 0;
  for (const line of lines) { offsets.push(at); at += line.length + 1; }
  const found: { start: number; end: number }[] = [];
  for (let i = 0; i + wanted.length <= lines.length; i++) {
    if (wanted.every((w, j) => lines[i + j]!.trim() === w)) {
      const last = i + wanted.length - 1;
      found.push({ start: offsets[i]!, end: offsets[last]! + lines[last]!.length });
    }
  }
  const match = found[0];
  // Refuse a "match" much larger than what was asked for.
  if (match && match.end - match.start > old.length * 1.5 + 40) return { start: -1, end: -1, count: 0, fuzzy: true };
  return match ? { ...match, count: found.length, fuzzy: true } : { start: -1, end: -1, count: 0, fuzzy: true };
}

/** The write side of the Workspace tool set (write, edit, copy, present). */
export function workspaceWriteTools(ctx: WorkspaceContext): ExecutableTool[] {
  const load = () => mountWorkspace(ctx);
  const save = async (path: string, text: string, change: 'write' | 'edit' | 'copy', expectedVersion: number | undefined, copiedFrom?: WorkspaceFile['copiedFrom']) => {
    if (text.length > MAX_NOTE_CHARS) throw new Error(`Notes are limited to ${MAX_NOTE_CHARS} characters; split the content into several files.`);
    const saved = await writeNote({ threadId: ctx.threadId, path, text, change, messageId: ctx.messageId, expectedVersion, copiedFrom });
    ctx.readVersions.set(path, saved.version);
    return saved;
  };
  return [
    {
      name: 'write_file',
      description: 'Create or replace a note under /notes. To change an existing note, read it first (or use edit_file).',
      parameters: object({ path: { type: 'string', description: 'e.g. /notes/summary.md' }, content: { type: 'string' } }, ['path', 'content']),
      execute: async (args) => {
        const path = notePath(args.path);
        const existing = (await load()).find((f) => f.path === path);
        const saved = await save(path, String(args.content), 'write', requireCurrentRead(ctx, existing, path));
        return { text: `${existing ? 'Updated' : 'Created'} ${path} (v${saved.version}, ${saved.text.length} characters).` };
      },
    },
    {
      name: 'edit_file',
      description: 'Replace exact text in a note you have read. old_string must match once unless replace_all is true.',
      parameters: object({ path: { type: 'string' }, old_string: { type: 'string', minLength: 1 }, new_string: { type: 'string' }, replace_all: { type: 'boolean' } }, ['path', 'old_string', 'new_string']),
      execute: async (args) => {
        const path = notePath(args.path);
        const file = (await load()).find((f) => f.path === path);
        if (!file) throw new Error(`No note at ${path}. Use write_file to create it.`);
        const version = requireCurrentRead(ctx, file, path);
        const old = String(args.old_string); const replacement = String(args.new_string);
        let text: string;
        if (args.replace_all === true && file.text.includes(old)) {
          text = file.text.split(old).join(replacement);
        } else {
          const found = locateEdit(file.text, old);
          if (!found.count) throw new Error(`old_string was not found in ${path}. Read the file again and copy the exact text to replace.`);
          if (found.count > 1) throw new Error(`old_string appears ${found.count} times in ${path}. Include more surrounding text to make it unique, or set replace_all to true.`);
          text = file.text.slice(0, found.start) + replacement + file.text.slice(found.end);
        }
        const saved = await save(path, text, 'edit', version);
        return { text: `Edited ${path} (v${saved.version}).` };
      },
    },
    {
      name: 'copy_file',
      description: 'Copy a whole file, or a line range of it, into a note under /notes. Copies exact text without retyping it.',
      parameters: object({
        source: { type: 'string' },
        destination: { type: 'string', description: 'A path under /notes.' },
        start_line: { type: 'integer', minimum: 1 },
        end_line: { type: 'integer', minimum: 1 },
      }, ['source', 'destination']),
      execute: async (args) => {
        const files = await load();
        const source = findMounted(files, String(args.source));
        const path = notePath(args.destination);
        const spans = lineSpans(source.text);
        if (!spans.length) throw new Error(`${source.path} is empty.`);
        const first = typeof args.start_line === 'number' ? args.start_line : 1;
        const last = Math.min(typeof args.end_line === 'number' ? args.end_line : spans.length, spans.length);
        if (first > last) throw new Error(`start_line ${first} is after end_line ${last} (${source.path} has ${spans.length} lines).`);
        const text = source.text.slice(spans[first - 1]!.start, spans[last - 1]!.end);
        const existing = files.find((f) => f.path === path);
        const saved = await save(path, text, 'copy', requireCurrentRead(ctx, existing, path), {
          path: source.path, startLine: first, endLine: last,
          pageStart: pageAt(source.pages, spans[first - 1]!.start), pageEnd: pageAt(source.pages, spans[last - 1]!.start),
        });
        return { text: `Copied ${source.path} lines ${first}-${last} to ${path} (v${saved.version}). The copy is your note: edit it freely, but cite the original, not the copy.` };
      },
    },
    {
      name: 'present_file',
      description: 'Hand a finished file to the user. It appears as a card they can open and download. Use for deliverables, not scratch work.',
      parameters: object({ path: { type: 'string' }, caption: { type: 'string', maxLength: 200 } }, ['path']),
      execute: async (args) => {
        const file = findMounted(await load(), String(args.path));
        if (file.kind === 'library') throw new Error('Library documents cannot be presented. Copy the part you need into /notes and present that.');
        const caption = typeof args.caption === 'string' && args.caption.trim() ? args.caption.trim() : undefined;
        return { text: `Presented ${file.path} (v${file.version}) to the user.`, presented: { fileId: file.id, path: file.path, version: file.version, caption } };
      },
    },
  ];
}

/** All eight built-in Workspace tools. */
export function workspaceTools(ctx: WorkspaceContext): ExecutableTool[] {
  return [...workspaceReadTools(ctx), ...workspaceWriteTools(ctx)];
}
