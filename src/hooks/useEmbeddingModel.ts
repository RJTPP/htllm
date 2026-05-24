import { useEffect, useReducer, useCallback } from 'react';
import type { EmbeddingProvider } from '../providers/types';
import { getSetting, setSetting } from '../data/settings';
import { getEmbeddingProvider } from '../providers/registry';

const PROVIDER_KEY = 'embeddingProviderId';
const MODEL_KEY = 'embeddingModelId';

/**
 * Embedding model selection is global — one active provider+model per
 * app, used by both the Knowledge page (for embedding documents and
 * semantic search) and chat (for RAG retrieval). All consumers share a
 * single source of truth so picking a new model in one surface updates
 * every other surface that reads it.
 *
 * Pattern: module-level state + subscribe/notify. Same approach as
 * src/lib/highlight.ts. useSyncExternalStore would be more idiomatic
 * React but adds boilerplate this small state doesn't need.
 */

interface Store {
  providerId: string | null;
  modelId: string | null;
  loaded: boolean;
}

let store: Store = { providerId: null, modelId: null, loaded: false };
const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;

function notify(): void {
  for (const fn of listeners) fn();
}

function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const [p, m] = await Promise.all([
      getSetting<string>(PROVIDER_KEY),
      getSetting<string>(MODEL_KEY),
    ]);
    store = { providerId: p ?? null, modelId: m ?? null, loaded: true };
    notify();
  })();
  return loadPromise;
}

async function setEmbeddingModel(providerId: string, modelId: string): Promise<void> {
  await setSetting(PROVIDER_KEY, providerId);
  await setSetting(MODEL_KEY, modelId);
  store = { providerId, modelId, loaded: true };
  notify();
}

async function clearEmbeddingModel(): Promise<void> {
  await setSetting(PROVIDER_KEY, null);
  await setSetting(MODEL_KEY, null);
  store = { providerId: null, modelId: null, loaded: true };
  notify();
}

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
 * Knowledge page (for embed/search), the header EmbeddingSlot, and
 * useChat (for RAG injection). All instances share state — changing the
 * selection anywhere updates every consumer.
 */
export function useEmbeddingModel(): EmbeddingModelState {
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    listeners.add(force);
    // Kick off the IDB load once, on first mount.
    ensureLoaded();
    return () => {
      listeners.delete(force);
    };
  }, []);

  const set = useCallback((pid: string, mid: string) => setEmbeddingModel(pid, mid), []);
  const clear = useCallback(() => clearEmbeddingModel(), []);

  const provider = store.providerId ? getEmbeddingProvider(store.providerId) ?? null : null;

  return {
    providerId: store.providerId,
    modelId: store.modelId,
    provider,
    loaded: store.loaded,
    setEmbeddingModel: set,
    clearEmbeddingModel: clear,
  };
}
