import { useEffect, useReducer, useCallback } from 'react';
import type { Library } from '../providers/types';
import { ensureDefaultLibrary, listLibraries } from '../data/libraries';
import { listDocumentsByLibrary } from '../data/documents';
import type { LibraryWithStats } from './useKnowledge';

/**
 * Module-level shared library list — every consumer (App.tsx for the
 * composer KnowledgeChip, Settings for the default-library picker,
 * KnowledgePage for its 3-column layout) reads the same store. Mutations
 * anywhere call refresh() and notify all subscribers.
 *
 * Same subscribe/notify pattern as useEmbeddingModel — module-level
 * state, useReducer force-update per hook instance. Avoids re-fetching
 * libraries per consumer while keeping the data in sync across the app.
 */

let store: LibraryWithStats[] = [];
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

async function loadOnce(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await ensureDefaultLibrary();
    // Flip the flag BEFORE refreshStore — its internal notify() is the
    // first chance subscribers get to see `loaded === true`. Setting it
    // after the notify would leave subscribers with a stale snapshot
    // (loaded=false) and no second notification to correct them.
    loaded = true;
    await refreshStore();
  })();
  return loadingPromise;
}

async function refreshStore(): Promise<void> {
  const libs = await listLibraries();
  const withStats = await Promise.all(
    libs.map(async (lib) => {
      const libDocs = await listDocumentsByLibrary(lib.id);
      const chunkCount = libDocs.reduce((sum, d) => sum + d.chunkCount, 0);
      return { lib, docCount: libDocs.length, chunkCount };
    }),
  );
  store = withStats;
  notify();
}

/**
 * Trigger a refresh from anywhere (e.g. after a library create / delete
 * / model rebind). Returns the new list so callers can chain on it.
 */
export async function refreshLibrariesShared(): Promise<LibraryWithStats[]> {
  await refreshStore();
  return store;
}

export interface UseLibrariesResult {
  libraries: LibraryWithStats[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

/**
 * Read the shared library list. Calling this in a component subscribes
 * the component to library updates — any other component that calls
 * refreshLibrariesShared() (or another useLibraries refresh()) will
 * trigger a re-render here.
 */
export function useLibraries(): UseLibrariesResult {
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    listeners.add(force);
    loadOnce();
    return () => {
      listeners.delete(force);
    };
  }, []);

  const refresh = useCallback(() => refreshStore(), []);

  return { libraries: store, loaded, refresh };
}

/** Convenience: find a library by id in the shared store without subscribing. */
export function findSharedLibrary(id: string): Library | null {
  return store.find((l) => l.lib.id === id)?.lib ?? null;
}
