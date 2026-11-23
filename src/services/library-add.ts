import { getWorkspaceFileById } from '../data/workspace';
import { getLibrary } from '../data/libraries';
import { getEmbeddingProvider } from '../providers/registry';
import { ingestText } from '../lib/ingest';
import { embedDocument } from '../lib/embed-pipeline';
import { invalidateHybridSearchCache } from '../lib/hybrid-search';
import { extensionOf } from '../lib/file-kind';

export interface AddToLibraryResult {
  documentId: string;
  /** False when the library has no usable embedding model yet; index it from Knowledge. */
  indexed: boolean;
}

/**
 * Copy a Workspace file into a Knowledge library (global layer, D-7), so it can
 * be searched by meaning in any chat. Uses the stored text and PDF page offsets,
 * so page provenance survives without the original file. Indexes it right away
 * when the library has a pinned embedding model whose provider is configured.
 */
export async function addToLibrary(
  fileId: string,
  libraryId: string,
  opts: { signal?: AbortSignal; onStatus?: (status: 'adding' | 'indexing') => void } = {},
): Promise<AddToLibraryResult> {
  const file = await getWorkspaceFileById(fileId);
  if (!file) throw new Error('This file no longer exists.');
  const library = await getLibrary(libraryId);
  if (!library) throw new Error('The selected library no longer exists.');
  opts.onStatus?.('adding');
  const filename = file.path.split('/').pop() ?? 'file.txt';
  const isPdf = file.mimeType === 'application/pdf' || extensionOf(filename) === 'pdf';
  const { document, chunks } = await ingestText({
    filename,
    mimeType: isPdf ? 'application/pdf' : file.mimeType,
    sizeBytes: file.text.length,
    text: file.text,
    pages: file.pages ?? [],
    isMarkdown: extensionOf(filename) === 'md' || extensionOf(filename) === 'markdown' || file.mimeType === 'text/markdown',
  }, libraryId, { signal: opts.signal });
  invalidateHybridSearchCache();
  const provider = library.embeddingModelId && library.embeddingProviderId ? getEmbeddingProvider(library.embeddingProviderId) : undefined;
  if (!provider || !chunks.length) return { documentId: document.id, indexed: false };
  opts.onStatus?.('indexing');
  await embedDocument(document.id, provider, library.embeddingModelId, undefined, { signal: opts.signal });
  invalidateHybridSearchCache();
  return { documentId: document.id, indexed: true };
}
