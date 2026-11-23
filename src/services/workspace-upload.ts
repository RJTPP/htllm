import type { WorkspaceFile } from '../providers/types';
import { addUpload, getWorkspaceFile } from '../data/workspace';
import { extractPdf } from '../lib/pdf';
import { extensionOf } from '../lib/file-kind';
import { isWorkspacePath } from '../lib/workspace-path';

/** Text-like files accepted as uploads, besides any text/* MIME type. */
const TEXT_EXTENSIONS = new Set(['txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'toml', 'html', 'htm',
  'js', 'mjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'cs', 'php', 'sh', 'sql', 'css', 'swift', 'lua', 'r', 'log', 'ini', 'env']);

/** Upper bounds so one upload cannot exhaust browser storage or the UI. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_CHARS = 5_000_000;

/** `accept` value for the composer's file input. */
export const UPLOAD_ACCEPT = ['application/pdf', 'text/*', 'application/json', ...[...TEXT_EXTENSIONS, 'pdf'].map((e) => `.${e}`)].join(',');

export class UploadError extends Error {
  constructor(message: string) { super(message); this.name = 'UploadError'; }
}

/** A safe file name segment; slashes and control characters become dashes. */
function safeName(name: string): string {
  return name.replace(/[\\/\u0000-\u001f\u007f]/g, '-').replace(/^\.+/, '').trim().slice(0, 200) || 'file';
}

/** First free `/uploads/<name>` path, adding " (2)", " (3)"… before the extension. */
async function freePath(threadId: string, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; n < 1000; n++) {
    const path = `/uploads/${n === 1 ? name : `${stem} (${n})${ext}`}`;
    if (isWorkspacePath(path) && !(await getWorkspaceFile(threadId, path))) return path;
  }
  throw new UploadError(`Too many files named ${name}.`);
}

/**
 * Add a user file to the chat's workspace as a read-only upload (D-5, D-17).
 * Text files are stored as text; PDFs as extracted text with page offsets
 * (scanned PDFs without a text layer are refused).
 */
export async function uploadToWorkspace(threadId: string, file: File, opts: { signal?: AbortSignal } = {}): Promise<WorkspaceFile> {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(`${file.name} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  const ext = extensionOf(file.name);
  let text: string;
  let pages: WorkspaceFile['pages'];
  let mimeType = file.type || 'text/plain';
  if (ext === 'pdf' || file.type === 'application/pdf') {
    const pdf = await extractPdf(file, { signal: opts.signal });
    text = pdf.text; pages = pdf.pages; mimeType = 'application/pdf';
  } else if (file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXTENSIONS.has(ext)) {
    text = await file.text();
  } else {
    throw new UploadError(`${file.name} is not supported. Attach text, Markdown, CSV, JSON, code or PDFs with a text layer.`);
  }
  if (!text.trim()) throw new UploadError(`${file.name} contains no readable text.`);
  if (text.length > MAX_UPLOAD_CHARS) throw new UploadError(`${file.name} has more than ${MAX_UPLOAD_CHARS.toLocaleString()} characters of text.`);
  const path = await freePath(threadId, safeName(file.name));
  return addUpload({ threadId, path, text, mimeType, pages });
}
