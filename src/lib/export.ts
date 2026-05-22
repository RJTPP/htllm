import { getDb } from '../data/db';

interface ExportData {
  version: 1;
  exportedAt: number;
  threads: unknown[];
  messages: unknown[];
  settings: unknown[];
  promptTemplates: unknown[];
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
  };
  return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const data = JSON.parse(json) as ExportData;
  if (data.version !== 1) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  const db = await getDb();

  const stores = ['threads', 'messages', 'settings', 'promptTemplates'] as const;
  for (const storeName of stores) {
    const tx = db.transaction(storeName, 'readwrite');
    await tx.store.clear();
    const items = data[storeName];
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
