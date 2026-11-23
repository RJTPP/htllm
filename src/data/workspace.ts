import { v4 as uuid } from 'uuid';
import type { WorkspaceFile, WorkspaceVersion } from '../providers/types';
import { getDb } from './db';
import { getDocument } from './documents';

/** All files in a chat's workspace, sorted by path. */
export async function listWorkspaceFiles(threadId: string): Promise<WorkspaceFile[]> {
  const files = await (await getDb()).getAllFromIndex('workspaceFiles', 'byThread', threadId);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function getWorkspaceFile(threadId: string, path: string): Promise<WorkspaceFile | undefined> {
  return (await getDb()).getFromIndex('workspaceFiles', 'byThreadPath', [threadId, path]);
}

export async function getWorkspaceFileById(id: string): Promise<WorkspaceFile | undefined> {
  return (await getDb()).get('workspaceFiles', id);
}

/** Store an uploaded input file (read-only to the model). Fails if the path is taken. */
export async function addUpload(input: Pick<WorkspaceFile, 'threadId' | 'path' | 'text' | 'mimeType' | 'pages'>): Promise<WorkspaceFile> {
  const now = Date.now();
  const file: WorkspaceFile = { ...input, id: uuid(), kind: 'upload', version: 1, createdAt: now, updatedAt: now };
  // The chat may have been deleted while the file was being read: check in the
  // same transaction, so an upload can never outlive its chat.
  const tx = (await getDb()).transaction(['threads', 'workspaceFiles'], 'readwrite');
  // Nothing is written yet, so let the transaction finish before refusing.
  if (!(await tx.objectStore('threads').get(input.threadId))) { await tx.done; throw new Error('This chat no longer exists.'); }
  try {
    await tx.objectStore('workspaceFiles').add(file);
    await tx.done;
  } catch (error) {
    // A taken path aborts the transaction; settle it before reporting.
    await tx.done.catch(() => {});
    throw error;
  }
  return file;
}

export interface NoteWrite {
  threadId: string;
  path: string;
  text: string;
  change: WorkspaceVersion['change'];
  messageId?: string;
  mimeType?: string;
  copiedFrom?: WorkspaceFile['copiedFrom'];
  /** Optimistic concurrency: reject unless the note is still at this version. */
  expectedVersion?: number;
}

/**
 * Create or update a note and record the new version, in one transaction.
 * Uploads can never be overwritten through this path (D-17).
 */
export async function writeNote(input: NoteWrite): Promise<WorkspaceFile> {
  const db = await getDb();
  const tx = db.transaction(['threads', 'workspaceFiles', 'workspaceVersions'], 'readwrite');
  // Nothing is written yet, so let the transaction finish before refusing.
  if (!(await tx.objectStore('threads').get(input.threadId))) { await tx.done; throw new Error('This chat no longer exists.'); }
  const files = tx.objectStore('workspaceFiles');
  const existing = await files.index('byThreadPath').get([input.threadId, input.path]);
  if (existing?.kind === 'upload') throw new Error(`${input.path} is an uploaded file and is read-only.`);
  if (input.expectedVersion !== undefined && existing?.version !== input.expectedVersion) {
    throw new Error(`${input.path} changed since it was read (now version ${existing?.version ?? 'none'}). Read it again before changing it.`);
  }
  const now = Date.now();
  const file: WorkspaceFile = existing
    ? { ...existing, text: input.text, version: existing.version + 1, updatedAt: now, ...(input.copiedFrom ? { copiedFrom: input.copiedFrom } : {}) }
    : { id: uuid(), threadId: input.threadId, path: input.path, kind: 'note', text: input.text, mimeType: input.mimeType ?? 'text/markdown',
        version: 1, copiedFrom: input.copiedFrom, createdAt: now, updatedAt: now };
  await files.put(file);
  await tx.objectStore('workspaceVersions').put({
    fileId: file.id, threadId: file.threadId, version: file.version, text: file.text,
    messageId: input.messageId, change: existing ? input.change : (input.change === 'copy' ? 'copy' : 'create'), createdAt: now,
  });
  await tx.done;
  return file;
}

export async function getWorkspaceVersion(fileId: string, version: number): Promise<WorkspaceVersion | undefined> {
  return (await getDb()).get('workspaceVersions', [fileId, version]);
}

export async function listWorkspaceVersions(fileId: string): Promise<WorkspaceVersion[]> {
  const versions = await (await getDb()).getAllFromIndex('workspaceVersions', 'byFile', fileId);
  return versions.sort((a, b) => a.version - b.version);
}

/** Number of workspace files in a chat (for the delete confirmation, D-20). */
export async function countWorkspaceFiles(threadId: string): Promise<number> {
  return (await getDb()).countFromIndex('workspaceFiles', 'byThread', threadId);
}

/** Note versions made during the given assistant messages (for the D-19 notice). */
export async function versionsByMessages(threadId: string, messageIds: string[]): Promise<{ path: string; version: number }[]> {
  if (!messageIds.length) return [];
  const db = await getDb();
  const ids = new Set(messageIds);
  const versions = (await db.getAllFromIndex('workspaceVersions', 'byThread', threadId)).filter((v) => v.messageId && ids.has(v.messageId));
  const latest = new Map<string, number>();
  for (const v of versions) latest.set(v.fileId, Math.max(latest.get(v.fileId) ?? 0, v.version));
  const out: { path: string; version: number }[] = [];
  for (const [fileId, version] of latest) {
    const file = await db.get('workspaceFiles', fileId);
    if (file) out.push({ path: file.path, version });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Whether a cited source still exists: a library document or a workspace file. */
export async function sourceExists(id: string): Promise<boolean> {
  return !!(await getDocument(id)) || !!(await getWorkspaceFileById(id));
}
