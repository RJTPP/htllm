import { useState, useEffect, useCallback } from 'react';
import type { Document, EmbeddingProvider } from '../providers/types';
import { listDocuments, deleteDocument } from '../data/documents';
import { countEmbeddingsForModel } from '../data/embeddings';
import { ingestFile } from '../lib/ingest';
import { DEFAULT_LIBRARY_ID } from '../data/libraries';
import {
  embedDocument,
  embedAllDocuments,
  type EmbedProgress,
} from '../lib/embed-pipeline';
import { getChunksForDocument } from '../data/chunks';
import { getEmbedding } from '../data/embeddings';
import { invalidateHybridSearchCache } from '../lib/hybrid-search';

/**
 * Per-document embedding status used by the Knowledge UI.
 * - 'none'    — no embeddings for this doc under the current model
 * - 'partial' — some chunks embedded (re-embed required to finish)
 * - 'full'    — every chunk has an embedding under the current model
 * - 'pending' — embedding in progress
 * - 'error'   — last embed attempt failed
 */
export type DocStatus = 'none' | 'partial' | 'full' | 'pending' | 'error';

export interface DocWithStatus {
  doc: Document;
  status: DocStatus;
  embeddedChunks: number;
  errorMessage?: string;
}

export interface UseKnowledgeOpts {
  provider: EmbeddingProvider | null;
  modelId: string | null;
}

export function useKnowledge({ provider, modelId }: UseKnowledgeOpts) {
  const [docs, setDocs] = useState<DocWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDocIds, setBusyDocIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<EmbedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Compute embedding status for each document under the active model.
   * Cheap-ish: one IDB scan per document, batched in a single Promise.all.
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    const documents = await listDocuments();
    if (!modelId) {
      setDocs(documents.map((doc) => ({ doc, status: 'none' as const, embeddedChunks: 0 })));
      setLoading(false);
      return;
    }
    const withStatus = await Promise.all(
      documents.map(async (doc): Promise<DocWithStatus> => {
        const chunks = await getChunksForDocument(doc.id);
        let embeddedChunks = 0;
        // Each chunk now holds one record per model — look up directly
        // by composite key instead of fetching all and comparing.
        for (const chunk of chunks) {
          const e = await getEmbedding(chunk.id, modelId);
          if (e) embeddedChunks++;
        }
        let status: DocStatus = 'none';
        if (embeddedChunks === 0) status = 'none';
        else if (embeddedChunks === chunks.length) status = 'full';
        else status = 'partial';
        return { doc, status, embeddedChunks };
      }),
    );
    setDocs(withStatus);
    setLoading(false);
  }, [modelId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Ingest one or more files into the knowledge base. */
  const uploadFiles = useCallback(
    async (files: File[], libraryId: string = DEFAULT_LIBRARY_ID): Promise<void> => {
      setError(null);
      for (const file of files) {
        try {
          await ingestFile(file, libraryId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`${file.name}: ${msg}`);
        }
      }
      invalidateHybridSearchCache();
      await refresh();
    },
    [refresh],
  );

  /** Embed a single document. No-op if no provider/model configured. */
  const embedOne = useCallback(
    async (docId: string): Promise<void> => {
      if (!provider || !modelId) {
        setError('Select an embedding model first.');
        return;
      }
      setBusyDocIds((s) => new Set(s).add(docId));
      setError(null);
      try {
        await embedDocument(docId, provider, modelId, (p) => setProgress(p));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setBusyDocIds((s) => {
          const next = new Set(s);
          next.delete(docId);
          return next;
        });
        setProgress(null);
        await refresh();
      }
    },
    [provider, modelId, refresh],
  );

  /** Embed every document not yet covered under the current model. */
  const embedAll = useCallback(async (): Promise<void> => {
    if (!provider || !modelId) {
      setError('Select an embedding model first.');
      return;
    }
    setError(null);
    try {
      await embedAllDocuments(provider, modelId, (p) => setProgress(p));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setProgress(null);
      await refresh();
    }
  }, [provider, modelId, refresh]);

  const removeDoc = useCallback(
    async (docId: string): Promise<void> => {
      await deleteDocument(docId);
      invalidateHybridSearchCache();
      await refresh();
    },
    [refresh],
  );

  return {
    docs,
    loading,
    busyDocIds,
    progress,
    error,
    refresh,
    uploadFiles,
    embedOne,
    embedAll,
    removeDoc,
  };
}

/** Total embedding count for the active model — used as a "ready to search" signal. */
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
