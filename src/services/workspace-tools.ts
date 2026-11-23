import type { SourceCitation, WorkspaceFile } from '../providers/types';
import type { ExecutableTool } from './tools';
import { listWorkspaceFiles } from '../data/workspace';
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
