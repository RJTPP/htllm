import { useState, useEffect, useCallback } from 'react';
import type { EmbeddingProvider } from '../providers/types';
import { getSetting, setSetting } from '../data/settings';
import { getEmbeddingProvider } from '../providers/registry';

const PROVIDER_KEY = 'embeddingProviderId';
const MODEL_KEY = 'embeddingModelId';

export interface EmbeddingModelState {
  providerId: string | null;
  modelId: string | null;
  provider: EmbeddingProvider | null;
  /** True once initial settings load completes. */
  loaded: boolean;
  setEmbeddingModel: (providerId: string, modelId: string) => Promise<void>;
  clearEmbeddingModel: () => Promise<void>;
}

/**
 * Tracks which embedding provider + model is active globally. Used by the
 * Knowledge page (for embed/search) and useChat (for RAG injection).
 *
 * Stored in the IDB settings store so it persists across sessions — same
 * pattern as defaultSystemPrompt / codeTheme.
 */
export function useEmbeddingModel(): EmbeddingModelState {
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, m] = await Promise.all([
        getSetting<string>(PROVIDER_KEY),
        getSetting<string>(MODEL_KEY),
      ]);
      if (cancelled) return;
      setProviderId(p ?? null);
      setModelId(m ?? null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setEmbeddingModel = useCallback(async (pid: string, mid: string) => {
    await setSetting(PROVIDER_KEY, pid);
    await setSetting(MODEL_KEY, mid);
    setProviderId(pid);
    setModelId(mid);
  }, []);

  const clearEmbeddingModel = useCallback(async () => {
    await setSetting(PROVIDER_KEY, null);
    await setSetting(MODEL_KEY, null);
    setProviderId(null);
    setModelId(null);
  }, []);

  const provider = providerId ? getEmbeddingProvider(providerId) ?? null : null;

  return { providerId, modelId, provider, loaded, setEmbeddingModel, clearEmbeddingModel };
}
