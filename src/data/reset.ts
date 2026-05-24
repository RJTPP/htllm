import { getDb } from './db';

const STORES = [
  'threads',
  'messages',
  'keys',
  'settings',
  'promptTemplates',
  'folders',
  'libraries',
  'documents',
  'chunks',
  'embeddings',
] as const;

/**
 * Wipes every trace of the app from this browser: all IndexedDB object stores,
 * the Cache API (where WebLLM keeps model weights), and the first-run flag.
 */
export async function resetEverything(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([...STORES], 'readwrite');
  await Promise.all(STORES.map((store) => tx.objectStore(store).clear()));
  await tx.done;

  if (typeof caches !== 'undefined') {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }

  try {
    localStorage.removeItem('htllm:visited');
  } catch {
    // localStorage may be unavailable; the reset still succeeds.
  }
}
