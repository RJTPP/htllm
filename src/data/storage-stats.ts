import { getDb } from './db';

export interface StoreStats {
  name: string;
  count: number;
}

/** Count records in each IndexedDB object store. */
export async function getStoreStats(): Promise<StoreStats[]> {
  const db = await getDb();
  const stores = [
    'threads',
    'messages',
    'keys',
    'settings',
    'promptTemplates',
    'folders',
    'documents',
    'chunks',
    'embeddings',
  ] as const;
  const results: StoreStats[] = [];
  for (const name of stores) {
    const tx = db.transaction(name, 'readonly');
    const count = await tx.store.count();
    await tx.done;
    results.push({ name, count });
  }
  return results;
}

export interface CacheEntry {
  /** Cache API cache name (e.g. "webllm/model"). */
  cacheName: string;
  /** Number of cached responses in this cache. */
  entryCount: number;
  /** Estimated total size in bytes (sum of response body sizes). */
  sizeBytes: number;
}

/**
 * Enumerate all Cache API caches and estimate their size.
 * This is where WebLLM stores downloaded model weights.
 */
export async function getCacheEntries(): Promise<CacheEntry[]> {
  if (typeof caches === 'undefined') return [];
  const names = await caches.keys();
  const entries: CacheEntry[] = [];
  for (const cacheName of names) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    let sizeBytes = 0;
    // Sample up to 5 entries to estimate average size, then extrapolate.
    // Cloning every response in a multi-GB cache is too slow.
    const sampleCount = Math.min(keys.length, 5);
    let sampledSize = 0;
    for (let i = 0; i < sampleCount; i++) {
      try {
        const req = keys[i];
        if (!req) continue;
        const resp = await cache.match(req);
        if (resp) {
          const blob = await resp.blob();
          sampledSize += blob.size;
        }
      } catch {
        // Response may be opaque or unreadable
      }
    }
    if (sampleCount > 0 && keys.length > sampleCount) {
      // Extrapolate from sample average
      sizeBytes = Math.round((sampledSize / sampleCount) * keys.length);
    } else {
      sizeBytes = sampledSize;
    }
    entries.push({ cacheName, entryCount: keys.length, sizeBytes });
  }
  return entries;
}

/** Delete a specific Cache API cache by name. */
export async function deleteCache(cacheName: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(cacheName);
}

/** Clear a single IndexedDB object store. */
export async function clearStore(
  storeName:
    | 'threads'
    | 'messages'
    | 'keys'
    | 'settings'
    | 'promptTemplates'
    | 'folders'
    | 'documents'
    | 'chunks'
    | 'embeddings',
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  await tx.store.clear();
  await tx.done;
}
