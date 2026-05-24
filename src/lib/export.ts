import { getDb } from '../data/db';

interface ExportData {
  version: 1;
  exportedAt: number;
  threads: unknown[];
  messages: unknown[];
  settings: unknown[];
  promptTemplates: unknown[];
  /** Added later — absent in older exports, which import as no folders. */
  folders?: unknown[];
  /** Phase 3 — knowledge base. Embeddings are intentionally omitted: they're
   *  large, model-specific, and re-derivable from chunks. */
  documents?: unknown[];
  chunks?: unknown[];
}

export async function exportAllData(): Promise<string> {
  const db = await getDb();
  const data: ExportData = {
    version: 1,
    exportedAt: Date.now(),
    threads: await db.getAll('threads'),
    messages: await db.getAll('messages'),
    settings: await db.getAll('settings'),
    promptTemplates: await db.getAll('promptTemplates'),
    folders: await db.getAll('folders'),
    documents: await db.getAll('documents'),
    chunks: await db.getAll('chunks'),
  };
  return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const data = JSON.parse(json) as ExportData;
  if (data.version !== 1) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  const db = await getDb();

  // Clear embeddings too — imported chunks are detached from their old
  // vectors. The user can re-embed from the Knowledge page.
  const stores = [
    'threads',
    'messages',
    'settings',
    'promptTemplates',
    'folders',
    'documents',
    'chunks',
    'embeddings',
  ] as const;
  for (const storeName of stores) {
    const tx = db.transaction(storeName, 'readwrite');
    await tx.store.clear();
    const items = (data as unknown as Record<string, unknown>)[storeName];
    if (Array.isArray(items)) {
      for (const item of items) {
        await tx.store.put(item as never);
      }
    }
    await tx.done;
  }
}

export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
