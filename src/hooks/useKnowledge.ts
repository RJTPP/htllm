import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Document, EmbeddingProvider, Library } from '../providers/types';
import { listDocumentsByLibrary, deleteDocument } from '../data/documents';
import { countEmbeddingsForModel, getEmbedding } from '../data/embeddings';
import { getChunksForDocument } from '../data/chunks';
import {
  createLibrary as createLibraryRecord,
  deleteLibrary as deleteLibraryRecord,
  ensureDefaultLibrary,
  listLibraries,
  updateLibrary,
  DEFAULT_LIBRARY_ID,
} from '../data/libraries';
import { ingestFile } from '../lib/ingest';
import { embedDocument, type EmbedProgress } from '../lib/embed-pipeline';
import { invalidateHybridSearchCache } from '../lib/hybrid-search';
import { getEmbeddingProvider } from '../providers/registry';

/**
 * Per-document embedding status under the active library's pinned model.
 */
export type DocStatus = 'none' | 'partial' | 'full' | 'pending' | 'error';

export interface DocWithStatus {
  doc: Document;
  status: DocStatus;
  embeddedChunks: number;
  errorMessage?: string;
}

export interface LibraryWithStats {
  lib: Library;
  docCount: number;
  chunkCount: number;
}

export function useKnowledge() {
  const [libraries, setLibraries] = useState<LibraryWithStats[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string>(DEFAULT_LIBRARY_ID);
  const [docs, setDocs] = useState<DocWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDocIds, setBusyDocIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<EmbedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.lib.id === activeLibraryId)?.lib ?? null,
    [libraries, activeLibraryId],
  );

  /** Reload the library list with counts. Counts come from documents
   *  rather than walking chunks so they're cheap. */
  const refreshLibraries = useCallback(async (): Promise<LibraryWithStats[]> => {
    await ensureDefaultLibrary();
    const libs = await listLibraries();
    const withStats = await Promise.all(
      libs.map(async (lib) => {
        const libDocs = await listDocumentsByLibrary(lib.id);
        const chunkCount = libDocs.reduce((sum, d) => sum + d.chunkCount, 0);
        return { lib, docCount: libDocs.length, chunkCount };
      }),
    );
    setLibraries(withStats);
    return withStats;
  }, []);

  /** Reload docs for the active library, computing per-doc embedding
   *  status against the library's pinned model. */
  const refreshDocs = useCallback(async (): Promise<void> => {
    if (!activeLibrary) {
      setDocs([]);
      return;
    }
    const list = await listDocumentsByLibrary(activeLibrary.id);
    const modelId = activeLibrary.embeddingModelId;
    if (!modelId) {
      // Library has no model pinned yet — every doc is unembeddable until
      // one is chosen. Show status='none' across the board.
      setDocs(list.map((doc) => ({ doc, status: 'none' as const, embeddedChunks: 0 })));
      return;
    }
    const withStatus = await Promise.all(
      list.map(async (doc): Promise<DocWithStatus> => {
        const chunks = await getChunksForDocument(doc.id);
        let embeddedChunks = 0;
        for (const chunk of chunks) {
          const rec = await getEmbedding(chunk.id, modelId);
          if (rec) embeddedChunks++;
        }
        let status: DocStatus = 'none';
        if (embeddedChunks === 0) status = 'none';
        else if (embeddedChunks === chunks.length) status = 'full';
        else status = 'partial';
        return { doc, status, embeddedChunks };
      }),
    );
    setDocs(withStatus);
  }, [activeLibrary]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    await refreshLibraries();
    setLoading(false);
  }, [refreshLibraries]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-load docs whenever the active library changes or its stats refresh.
  useEffect(() => {
    refreshDocs();
  }, [refreshDocs, libraries]);

  /** Create a new library. Sets it as active on success. */
  const createLibrary = useCallback(
    async (input: {
      name: string;
      embeddingProviderId?: string;
      embeddingModelId?: string;
    }) => {
      const lib = await createLibraryRecord(input);
      await refreshLibraries();
      setActiveLibraryId(lib.id);
      return lib;
    },
    [refreshLibraries],
  );

  /** Rename or rebind a library to a new embedding model. Caller is
   *  responsible for re-embedding docs when the model changes. */
  const editLibrary = useCallback(
    async (id: string, patch: Partial<Library>) => {
      await updateLibrary(id, patch);
      await refreshLibraries();
    },
    [refreshLibraries],
  );

  /** Delete a library and all its documents (cascading). The Default
   *  library can't be deleted. */
  const removeLibrary = useCallback(
    async (id: string) => {
      const targetDocs = await listDocumentsByLibrary(id);
      for (const d of targetDocs) {
        await deleteDocument(d.id);
      }
      await deleteLibraryRecord(id);
      invalidateHybridSearchCache();
      if (activeLibraryId === id) {
        setActiveLibraryId(DEFAULT_LIBRARY_ID);
      }
      await refreshLibraries();
    },
    [activeLibraryId, refreshLibraries],
  );

  /** Ingest files into the active library. */
  const uploadFiles = useCallback(
    async (files: File[]): Promise<void> => {
      setError(null);
      for (const file of files) {
        try {
          await ingestFile(file, activeLibraryId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`${file.name}: ${msg}`);
        }
      }
      invalidateHybridSearchCache();
      await refreshLibraries();
    },
    [activeLibraryId, refreshLibraries],
  );

  /** Resolve the active library's embedding provider. Returns null if
   *  the library has no model pinned or the provider isn't registered. */
  const activeEmbeddingProvider = useMemo((): EmbeddingProvider | null => {
    if (!activeLibrary) return null;
    if (!activeLibrary.embeddingProviderId || !activeLibrary.embeddingModelId) {
      return null;
    }
    return getEmbeddingProvider(activeLibrary.embeddingProviderId) ?? null;
  }, [activeLibrary]);

  /** Embed one document under the library's pinned model. */
  const embedOne = useCallback(
    async (docId: string): Promise<void> => {
      if (!activeLibrary || !activeEmbeddingProvider || !activeLibrary.embeddingModelId) {
        setError('Pin an embedding model to this library before embedding.');
        return;
      }
      setBusyDocIds((s) => new Set(s).add(docId));
      setError(null);
      try {
        await embedDocument(
          docId,
          activeEmbeddingProvider,
          activeLibrary.embeddingModelId,
          (p) => setProgress(p),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyDocIds((s) => {
          const next = new Set(s);
          next.delete(docId);
          return next;
        });
        setProgress(null);
        await refreshDocs();
      }
    },
    [activeLibrary, activeEmbeddingProvider, refreshDocs],
  );

  /** Embed every doc in the active library that isn't fully covered. */
  const embedAll = useCallback(async (): Promise<void> => {
    if (!activeLibrary || !activeEmbeddingProvider || !activeLibrary.embeddingModelId) {
      setError('Pin an embedding model to this library before embedding.');
      return;
    }
    setError(null);
    try {
      // embedAllDocuments embeds the whole DB; we want only the active
      // library's docs, so iterate them explicitly.
      const list = await listDocumentsByLibrary(activeLibrary.id);
      const totalChunks = list.reduce((sum, d) => sum + d.chunkCount, 0);
      let done = 0;
      for (const d of list) {
        await embedDocument(
          d.id,
          activeEmbeddingProvider,
          activeLibrary.embeddingModelId,
          (p) => setProgress({ embedded: done + p.embedded, total: totalChunks, documentId: d.id }),
        );
        done += d.chunkCount;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
      await refreshDocs();
    }
  }, [activeLibrary, activeEmbeddingProvider, refreshDocs]);

  const removeDoc = useCallback(
    async (docId: string): Promise<void> => {
      await deleteDocument(docId);
      invalidateHybridSearchCache();
      await refreshLibraries();
    },
    [refreshLibraries],
  );

  return {
    libraries,
    activeLibraryId,
    setActiveLibraryId,
    activeLibrary,
    docs,
    loading,
    busyDocIds,
    progress,
    error,
    refresh,
    createLibrary,
    editLibrary,
    removeLibrary,
    uploadFiles,
    embedOne,
    embedAll,
    removeDoc,
  };
}

/** Total embedding count for the given model — used as a "ready to search" signal. */
export function useEmbeddingCount(modelId: string | null): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!modelId) {
      setCount(0);
      return;
    }
    let cancelled = false;
    countEmbeddingsForModel(modelId).then((n) => {
      if (!cancelled) setCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [modelId]);
  return count;
}
