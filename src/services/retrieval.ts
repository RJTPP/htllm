import { getLibrary } from '../data/libraries';
import { getEmbeddingProvider } from '../providers/registry';
import { buildRagContext } from '../lib/rag-context';
import type { SourceCitation } from '../providers/types';
import type { SearchResult } from '../lib/hybrid-search';
import { listDocumentsByLibrary } from '../data/documents';
import { getChunksForDocument } from '../data/chunks';
import { getAllEmbeddingsForModel } from '../data/embeddings';

export function citation(hit: SearchResult): SourceCitation {
  return { id: hit.chunkId, chunkId: hit.chunkId, documentId: hit.documentId, filename: hit.filename,
    excerpt: hit.text, headingPath: hit.headingPath, pageStart: hit.pageStart, pageEnd: hit.pageEnd };
}
export async function retrieve(libraryId: string, query: string, signal?: AbortSignal, maxChars = 4000) {
  const library = await getLibrary(libraryId);
  if (!library?.embeddingModelId || !library.embeddingProviderId) throw new Error('Knowledge unavailable: configure the library embedding model.');
  const provider = getEmbeddingProvider(library.embeddingProviderId);
  if (!provider) throw new Error('Knowledge unavailable: configure its embedding provider.');
  const documents = await listDocumentsByLibrary(libraryId);
  const chunks = (await Promise.all(documents.map((doc) => getChunksForDocument(doc.id)))).flat();
  const indexed = new Set((await getAllEmbeddingsForModel(library.embeddingModelId)).map((record) => record.chunkId));
  if (!chunks.length || chunks.some((chunk) => !indexed.has(chunk.id))) throw new Error('Knowledge unavailable: the selected library is empty or not fully indexed. Finish indexing it, retry, or turn Knowledge off explicitly.');
  const result = await buildRagContext(query, provider, library.embeddingModelId, { libraryIds: [libraryId], signal, maxChars });
  if (result.reason === 'embed-failed' || result.reason === 'no-index') throw new Error('Knowledge unavailable: embedding failed or the library needs indexing. Retry or turn Knowledge off explicitly.');
  return { ...result, citations: result.sources.map(citation) };
}
