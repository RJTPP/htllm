/** How the Workspace viewer renders a file (D-27). HTML and SVG are shown as code, never rendered. */
export type RenderKind = 'markdown' | 'csv' | 'json' | 'code' | 'text';

const CODE: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', py: 'python', rb: 'ruby', go: 'go',
  rs: 'rust', java: 'java', kt: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash', bash: 'bash',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', html: 'html', htm: 'html', svg: 'xml', css: 'css',
  swift: 'swift', lua: 'lua', r: 'r',
};

export function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function renderKind(path: string, mimeType?: string): { kind: RenderKind; language?: string } {
  // A recognized extension wins over the stored MIME type (notes default to Markdown).
  const ext = extensionOf(path);
  if (ext === 'md' || ext === 'markdown') return { kind: 'markdown' };
  if (ext === 'csv') return { kind: 'csv' };
  if (ext === 'json') return { kind: 'json' };
  if (CODE[ext]) return { kind: 'code', language: CODE[ext] };
  if (ext) return { kind: 'text' };
  if (mimeType === 'text/markdown') return { kind: 'markdown' };
  if (mimeType === 'text/csv') return { kind: 'csv' };
  if (mimeType === 'application/json') return { kind: 'json' };
  return { kind: 'text' };
}

/** MIME type for downloading a file by its extension. */
export function downloadType(path: string, mimeType?: string): string {
  const ext = extensionOf(path);
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'json') return 'application/json';
  if (ext === 'pdf') return 'text/plain'; // uploads keep extracted text, not the original PDF
  return mimeType && mimeType.startsWith('text/') ? mimeType : 'text/plain';
}

/** Download name: the file's basename; extracted PDFs become .txt so the type is honest. */
export function downloadName(path: string): string {
  const name = path.split('/').pop() || 'file.txt';
  return extensionOf(name) === 'pdf' ? `${name}.txt` : name;
}
