import { getDb, DEFAULT_LIBRARY_ID } from '../data/db';
import { clearToolTrust } from '../services/approvals';
import { invalidateHybridSearchCache } from './hybrid-search';
import { isWorkspacePath } from './workspace-path';

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
  libraries?: unknown[];
  documents?: unknown[];
  chunks?: unknown[];
  /** Hierarchical chunking parents (D8). Older exports lack this; their
   *  chunks have undefined `parentId` and retrieval falls back to chunk
   *  text, so the absence is graceful. */
  parents?: unknown[];
  summaries?: unknown[];
  mcpConnections?: unknown[];
  /** v10 — per-chat workspace files and note versions. */
  workspaceFiles?: unknown[];
  workspaceVersions?: unknown[];
}

export async function exportAllData(): Promise<string> {
  const db = await getDb();
  // One consistent snapshot: a concurrent chat/ingestion transaction cannot
  // leave the backup with children from a different state than their parents.
  const tx = db.transaction(['threads', 'messages', 'settings', 'promptTemplates', 'folders', 'libraries', 'documents', 'chunks', 'parents', 'summaries', 'mcpConnections', 'workspaceFiles', 'workspaceVersions'], 'readonly');
  const data: ExportData = {
    version: 1,
    exportedAt: Date.now(),
    threads: await tx.objectStore('threads').getAll(),
    messages: await tx.objectStore('messages').getAll(),
    settings: await tx.objectStore('settings').getAll(),
    promptTemplates: await tx.objectStore('promptTemplates').getAll(),
    folders: await tx.objectStore('folders').getAll(),
    libraries: await tx.objectStore('libraries').getAll(),
    documents: await tx.objectStore('documents').getAll(),
    chunks: await tx.objectStore('chunks').getAll(),
    parents: await tx.objectStore('parents').getAll(),
    summaries: await tx.objectStore('summaries').getAll(),
    mcpConnections: await tx.objectStore('mcpConnections').getAll(),
    workspaceFiles: await tx.objectStore('workspaceFiles').getAll(),
    workspaceVersions: await tx.objectStore('workspaceVersions').getAll(),
  };
  await tx.done;
  return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const data = validateImport(json);
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
    'libraries',
    'documents',
    'chunks',
    'parents',
    'embeddings',
    'summaries',
    'mcpConnections',
    'workspaceFiles',
    'workspaceVersions',
    'keys',
  ] as const;
  const tx = db.transaction([...stores], 'readwrite');
  try {
  for (const storeName of stores) {
    const store = tx.objectStore(storeName);
    await store.clear();
    const items = (data as unknown as Record<string, unknown>)[storeName];
    if (storeName !== 'keys' && Array.isArray(items)) {
      for (const item of items) {
        const row = item as Record<string, unknown>;
        if (storeName === 'messages' && row.runStatus === 'running') row.runStatus = 'stopped';
        // D-11 for backups made before modes existed.
        if (storeName === 'threads' && row.mode === undefined) row.mode = row.agentEnabled ? 'workspace' : 'chat';
        if (storeName === 'messages' && Array.isArray(row.activity)) {
          row.activity = row.activity.map((event) => ['approval', 'running'].includes(event.status)
            ? { ...event, status: event.server && event.status === 'running' ? 'unknown' : 'stopped' } : event);
        }
        await store.put(item as never);
      }
    }
  }
  await tx.done;
  clearToolTrust();
  invalidateHybridSearchCache();
  } catch (error) {
    try { tx.abort(); } catch { /* already aborted */ }
    await tx.done.catch(() => {});
    throw error;
  }
}

/** Validate the entire backup before opening any destructive transaction. */
export function validateImport(json: string): ExportData {
  const data: unknown = JSON.parse(json);
  if (!data || typeof data !== 'object' || (data as ExportData).version !== 1) {
    throw new Error('Unsupported or invalid backup version');
  }
  const root = data as Record<string, unknown>;
  if ('keys' in root) throw new Error('Credentials cannot be imported from a backup.');
  // Pre-library exports used the same export version but had unscoped
  // documents. Mirror the IndexedDB v6 migration without guessing a model.
  if (root.libraries === undefined && Array.isArray(root.documents) && root.documents.length && root.documents.every((doc) => doc && typeof doc === 'object' && doc.libraryId === undefined)) {
    root.libraries = [{ id: DEFAULT_LIBRARY_ID, name: 'Default', embeddingModelId: '', createdAt: 0 }];
    root.documents = root.documents.map((doc) => ({ ...doc, libraryId: DEFAULT_LIBRARY_ID }));
  }
  const fields: Record<string, string[]> = {
    threads: ['id', 'title', 'providerId', 'modelId'], messages: ['id', 'threadId', 'role'],
    settings: ['key'], promptTemplates: ['id'], folders: ['id', 'name'],
    libraries: ['id', 'name', 'embeddingModelId'], documents: ['id', 'libraryId', 'filename'],
    chunks: ['id', 'documentId', 'text'], parents: ['id', 'documentId', 'text'],
    summaries: ['id', 'threadId', 'text'], mcpConnections: ['id', 'name', 'url'],
    workspaceFiles: ['id', 'threadId', 'path', 'kind', 'text', 'mimeType'],
    workspaceVersions: ['fileId', 'threadId', 'text', 'change'],
  };
  for (const [store, required] of Object.entries(fields)) {
    const rows = root[store];
    if (rows === undefined && !['threads', 'messages', 'settings', 'promptTemplates'].includes(store)) continue;
    if (!Array.isArray(rows)) throw new Error(`Invalid ${store} array`);
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || required.some((k) => typeof row[k] !== 'string')) {
        throw new Error(`Invalid ${store} record`);
      }
      const key = store === 'workspaceVersions' ? `${row.fileId}:${row.version}` : row[required[0]!];
      if (ids.has(key)) throw new Error(`Duplicate ${store} identifier`);
      ids.add(key);
      for (const field of ['createdAt', 'updatedAt', 'sizeBytes', 'chunkCount', 'index', 'startOffset', 'pageStart', 'pageEnd']) {
        if (row[field] !== undefined && (typeof row[field] !== 'number' || !Number.isFinite(row[field]) || row[field] < 0)) throw new Error(`Invalid ${store} ${field}`);
      }
      if (store === 'documents') {
        if (row.extractedText !== undefined && typeof row.extractedText !== 'string') throw new Error('Invalid extracted document text');
        if (row.pages !== undefined && (!Array.isArray(row.pages) || !row.pages.every((p: Record<string, unknown>) => p && ['page', 'start', 'end'].every((key) => Number.isSafeInteger(p[key]) && (p[key] as number) >= 0) && (p.end as number) >= (p.start as number)))) throw new Error('Invalid document page provenance');
      }
      if (store === 'workspaceFiles') {
        if (!['upload', 'note'].includes(row.kind)) throw new Error('Invalid workspace file kind');
        if (!isWorkspacePath(row.path)) throw new Error('Invalid workspace file path');
        if (!Number.isSafeInteger(row.version) || row.version < 1) throw new Error('Invalid workspace file version');
        if (row.pages !== undefined && (!Array.isArray(row.pages) || !row.pages.every((p: Record<string, unknown>) => p && ['page', 'start', 'end'].every((key) => Number.isSafeInteger(p[key]) && (p[key] as number) >= 0)))) throw new Error('Invalid workspace file pages');
      }
      if (store === 'workspaceVersions') {
        if (!Number.isSafeInteger(row.version) || row.version < 1) throw new Error('Invalid workspace version');
        if (!['create', 'write', 'edit', 'copy', 'user'].includes(row.change)) throw new Error('Invalid workspace version change');
        if (row.messageId !== undefined && typeof row.messageId !== 'string') throw new Error('Invalid workspace version message');
        if (row.copiedFrom !== undefined && (!row.copiedFrom || typeof row.copiedFrom !== 'object' || !isWorkspacePath(row.copiedFrom.path))) throw new Error('Invalid workspace version source');
      }
      if (store === 'threads') {
        if (row.mode !== undefined && !['chat', 'workspace'].includes(row.mode)) throw new Error('Invalid chat mode');
        if (row.attachedLibraryIds !== undefined && (!Array.isArray(row.attachedLibraryIds) || !row.attachedLibraryIds.every((id: unknown) => typeof id === 'string'))) throw new Error('Invalid attached libraries');
        if (row.automaticRagEnabled !== undefined && typeof row.automaticRagEnabled !== 'boolean') throw new Error('Invalid automatic RAG setting');
        if (row.agentEnabled !== undefined && typeof row.agentEnabled !== 'boolean') throw new Error('Invalid Tools setting');
        // toolModelKey and ragEnabled are retired fields; older backups may still carry them.
        for (const key of ['systemPrompt', 'folderId', 'toolModelKey']) {
          if (row[key] !== undefined && typeof row[key] !== 'string') throw new Error(`Invalid thread ${key}`);
        }
        if (row.ragEnabled !== undefined && typeof row.ragEnabled !== 'boolean') throw new Error('Invalid thread ragEnabled');
        if (row.modelParams !== undefined) {
          const params = row.modelParams as Record<string, unknown>;
          if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Invalid model parameters');
          for (const key of ['temperature', 'topP', 'maxTokens', 'presencePenalty', 'frequencyPenalty', 'contextWindow']) {
            if (params[key] !== undefined && (typeof params[key] !== 'number' || !Number.isFinite(params[key]))) throw new Error('Invalid model parameters');
          }
          if (params.reasoningEffort !== undefined && typeof params.reasoningEffort !== 'string') throw new Error('Invalid model parameters');
        }
        if (row.libraryId != null && typeof row.libraryId !== 'string') throw new Error('Invalid library selection');
        if (row.enabledToolIds !== undefined && (!Array.isArray(row.enabledToolIds) || !row.enabledToolIds.every((id: unknown) => typeof id === 'string'))) throw new Error('Invalid tool selections');
      }
      if (store === 'messages') {
        if (row.citations !== undefined && (!Array.isArray(row.citations) || !row.citations.every((source: Record<string, unknown>) => source && ['id', 'documentId', 'chunkId', 'filename', 'excerpt'].every((k) => typeof source[k] === 'string')))) throw new Error('Invalid citations');
        if (row.activity !== undefined && (!Array.isArray(row.activity) || !row.activity.every((event: Record<string, unknown>) =>
          event && ['id', 'tool', 'arguments'].every((k) => typeof event[k] === 'string') &&
          ['approval', 'running', 'complete', 'denied', 'error', 'unknown', 'stopped'].includes(String(event.status)) &&
          (event.result === undefined || typeof event.result === 'string')
        ))) throw new Error('Invalid tool activity');
        if (row.runStatus !== undefined && !['running', 'complete', 'stopped', 'error'].includes(row.runStatus)) throw new Error('Invalid run status');
        if (row.attachments !== undefined && (!Array.isArray(row.attachments) || !row.attachments.every((a: Record<string, unknown>) =>
          a && typeof a.fileId === 'string' && isWorkspacePath(a.path) && Number.isSafeInteger(a.chars) && (a.chars as number) >= 0 && (a.pages === undefined || Number.isSafeInteger(a.pages))))) throw new Error('Invalid message attachments');
        if (row.toolBudgetReached !== undefined && typeof row.toolBudgetReached !== 'boolean') throw new Error('Invalid tool budget flag');
        if (row.presentedFiles !== undefined && (!Array.isArray(row.presentedFiles) || !row.presentedFiles.every((p: Record<string, unknown>) =>
          p && typeof p.fileId === 'string' && isWorkspacePath(p.path) && Number.isSafeInteger(p.version) && (p.version as number) >= 1 && (p.caption === undefined || typeof p.caption === 'string')))) throw new Error('Invalid presented files');
      }
      if (store === 'messages' && (!['user', 'assistant', 'system'].includes(row.role) ||
        !(typeof row.content === 'string' || (Array.isArray(row.content) && row.content.every((p: Record<string, unknown>) =>
          p && (p.type === 'text' ? typeof p.text === 'string' : p.type === 'image_url' && !!p.image_url && typeof (p.image_url as Record<string, unknown>).url === 'string')))))) {
        throw new Error('Invalid message content');
      }
      if (store === 'summaries' && (!Array.isArray(row.replacedMessageIds) || !row.replacedMessageIds.every((id: unknown) => typeof id === 'string'))) throw new Error('Invalid summary');
      if (store === 'mcpConnections' && (!Array.isArray(row.tools) || Object.keys(row).some((k) => !['id', 'name', 'url', 'tools'].includes(k)))) throw new Error('Invalid MCP configuration');
      if (store === 'mcpConnections') {
        const url = new URL(row.url);
        if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Invalid MCP endpoint');
        if (!row.tools.every((tool: Record<string, unknown>) => tool && typeof tool.name === 'string' && typeof tool.description === 'string' && tool.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters) && Object.keys(tool).every((k) => ['name', 'description', 'parameters', 'readOnlyHint'].includes(k)) && (tool.readOnlyHint === undefined || typeof tool.readOnlyHint === 'boolean'))) throw new Error('Invalid MCP tools');
      }
      if (store === 'settings' && /secret|password|apikey|bearer|accessToken|refreshToken/i.test(row.key)) throw new Error('Credentials cannot be imported as settings');
    }
  }
  const ids = (store: string) => new Set(((root[store] ?? []) as {id: string}[]).map((r) => r.id));
  const threads = ids('threads'); const documents = ids('documents'); const libraries = ids('libraries');
  for (const row of (root.messages as {threadId: string}[])) if (!threads.has(row.threadId)) throw new Error('Orphan message');
  for (const row of (root.summaries ?? []) as {threadId: string}[]) if (!threads.has(row.threadId)) throw new Error('Orphan summary');
  for (const row of (root.documents ?? []) as {libraryId: string}[]) if (!libraries.has(row.libraryId)) throw new Error('Orphan document');
  for (const store of ['chunks', 'parents']) for (const row of (root[store] ?? []) as {documentId: string}[]) if (!documents.has(row.documentId)) throw new Error('Orphan chunk');
  const files = new Map(((root.workspaceFiles ?? []) as {id: string; threadId: string}[]).map((f) => [f.id, f.threadId]));
  for (const threadId of files.values()) if (!threads.has(threadId)) throw new Error('Orphan workspace file');
  for (const row of (root.workspaceVersions ?? []) as {fileId: string; threadId: string}[]) if (files.get(row.fileId) !== row.threadId) throw new Error('Orphan workspace version');
  return data as ExportData;
}

/** Save text as a file through a temporary object URL (no network). */
export function downloadText(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
