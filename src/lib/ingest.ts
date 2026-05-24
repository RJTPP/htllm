/**
 * Document ingestion orchestrator. Reads a File, extracts text, chunks it
 * with markdown-aware splitting when applicable, and persists Document +
 * Chunks to IndexedDB. Returns the persisted records so the caller can
 * kick off embedding immediately.
 *
 * Embedding is NOT triggered from here — keeping ingestion synchronous and
 * deterministic makes the UI easier to reason about. The Knowledge page
 * triggers embedding as a separate step.
 */

import type { Document, Chunk } from '../providers/types';
import { addDocument } from '../data/documents';
import { addChunks } from '../data/chunks';
import { chunkText, type ChunkOpts } from './chunking';
import { extractPdfText, UnsupportedPdfError } from './pdf';

export interface IngestResult {
  document: Document;
  chunks: Chunk[];
}

export class UnsupportedFileTypeError extends Error {
  constructor(mimeType: string, filename: string) {
    super(`Unsupported file type: ${mimeType || filename}`);
    this.name = 'UnsupportedFileTypeError';
  }
}

/** Read a File as UTF-8 text via FileReader. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Detect whether a file is markdown by extension first (cheap and reliable
 * for user uploads) and by MIME as fallback. Some browsers report .md as
 * application/octet-stream, so extension wins.
 */
function isMarkdownFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.md') || name.endsWith('.markdown')) return true;
  return file.type === 'text/markdown';
}

function isPlainTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.text')) return true;
  return file.type.startsWith('text/');
}

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return true;
  return file.type === 'application/pdf';
}

/**
 * Ingest a single file: extract text, chunk, persist. Throws on unsupported
 * formats so the UI can show a typed error.
 */
export async function ingestFile(
  file: File,
  opts: ChunkOpts = {},
): Promise<IngestResult> {
  let text: string;
  let isMarkdown = false;

  if (isMarkdownFile(file)) {
    text = await readAsText(file);
    isMarkdown = true;
  } else if (isPlainTextFile(file)) {
    text = await readAsText(file);
  } else if (isPdfFile(file)) {
    // Will throw UnsupportedPdfError until pdfjs-dist lands.
    text = await extractPdfText(file);
  } else {
    throw new UnsupportedFileTypeError(file.type, file.name);
  }

  const rawChunks = chunkText(text, { ...opts, isMarkdown });

  const document = await addDocument({
    filename: file.name,
    mimeType: file.type || (isMarkdown ? 'text/markdown' : 'text/plain'),
    sizeBytes: file.size,
    chunkCount: rawChunks.length,
  });

  const chunks = await addChunks(
    rawChunks.map((c, i) => ({
      documentId: document.id,
      index: i,
      text: c.text,
      startOffset: c.startOffset,
      ...(c.headingPath ? { headingPath: c.headingPath } : {}),
    })),
  );

  return { document, chunks };
}

export { UnsupportedPdfError };
