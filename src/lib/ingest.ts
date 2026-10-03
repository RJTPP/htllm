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

import type { Document, Chunk, ParentChunk } from '../providers/types';
import { getDb } from '../data/db';
import { v4 as uuid } from 'uuid';
import { chunkTextHierarchical, type HierarchicalChunkOpts } from './chunking';
import { extractPdf, UnsupportedPdfError, type ExtractedPdf } from './pdf';

export interface IngestResult {
  document: Document;
  chunks: Chunk[];
  parents: ParentChunk[];
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
 * Ingest a single file into the given library. Extracts text, chunks,
 * and persists the Document + Chunks. Throws on unsupported formats so
 * the UI can show a typed error.
 */
export async function ingestFile(
  file: File,
  libraryId: string,
  opts: HierarchicalChunkOpts & { signal?: AbortSignal; onProgress?: (page: number, total: number) => void } = {},
): Promise<IngestResult> {
  let text: string;
  let isMarkdown = false;
  let pages: ExtractedPdf['pages'] = [];
  opts.signal?.throwIfAborted();

  if (isMarkdownFile(file)) {
    text = await readAsText(file);
    isMarkdown = true;
  } else if (isPlainTextFile(file)) {
    text = await readAsText(file);
  } else if (isPdfFile(file)) {
    const pdf = await extractPdf(file, opts);
    text = pdf.text;
    pages = pdf.pages;
  } else {
    throw new UnsupportedFileTypeError(file.type, file.name);
  }

  // D8: hierarchical chunking. Children get embedded + searched; parents
  // get returned to the LLM. Persist parents first so we have stable ids
  // to stamp onto the children's parentId field.
  const hierarchy = chunkTextHierarchical(text, { ...opts, isMarkdown });

  if (!text.trim()) throw new Error('The file contains no readable text.');
  const pageInfo = (offset: number, length: number) => {
    const matched = pages.filter((p) => p.end > offset && p.start < offset + length);
    return matched.length ? { pageStart: matched[0]!.page, pageEnd: matched[matched.length - 1]!.page } : {};
  };
  const document: Document = {
    id: uuid(), createdAt: Date.now(),
    libraryId,
    filename: file.name,
    mimeType: file.type || (isPdfFile(file) ? 'application/pdf' : isMarkdown ? 'text/markdown' : 'text/plain'),
    sizeBytes: file.size,
    chunkCount: hierarchy.children.length,
    extractedText: text,
    pages,
  };

  const parents: ParentChunk[] = (
    hierarchy.parents.map((p, i) => ({
      documentId: document.id,
      id: uuid(),
      index: i,
      text: p.text,
      startOffset: p.startOffset,
      ...pageInfo(p.startOffset, p.text.length),
      ...(p.headingPath ? { headingPath: p.headingPath } : {}),
    }))
  );

  const chunks: Chunk[] = (
    hierarchy.children.map((c, i) => {
      const parentIdx = hierarchy.childParentIndex[i] ?? 0;
      const parent = parents[parentIdx];
      return {
        documentId: document.id,
        id: uuid(),
        index: i,
        text: c.text,
        startOffset: c.startOffset,
        ...pageInfo(c.startOffset, c.text.length),
        ...(c.headingPath ? { headingPath: c.headingPath } : {}),
        ...(parent ? { parentId: parent.id } : {}),
      };
    })
  );

  opts.signal?.throwIfAborted();
  const db = await getDb();
  const tx = db.transaction(['documents', 'parents', 'chunks'], 'readwrite');
  await tx.objectStore('documents').put(document);
  for (const parent of parents) await tx.objectStore('parents').put(parent);
  for (const chunk of chunks) await tx.objectStore('chunks').put(chunk);
  await tx.done;
  return { document, chunks, parents };
}

export { UnsupportedPdfError };
