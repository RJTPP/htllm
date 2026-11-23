import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, FolderOpen, Upload, X } from 'lucide-react';
import type { WorkspaceFile, WorkspaceVersion } from '../../providers/types';
import { getWorkspaceFileById, listWorkspaceFiles, listWorkspaceVersions } from '../../data/workspace';
import { downloadText } from '../../lib/export';
import { downloadName, downloadType } from '../../lib/file-kind';
import { fmtBytes, fmtRelativeTime } from '../../lib/format';
import { FileContent } from './FileContent';

export type PanelView = { tab: 'files' } | { tab: 'file'; fileId: string; version?: number };

const CHANGE_LABEL: Record<WorkspaceVersion['change'], string> = {
  create: 'created by the model', write: 'rewritten by the model', edit: 'edited by the model', copy: 'copied by the model', user: 'changed by you',
};

/** Save one version of a file. Shared by the viewer and delivery cards. */
export async function downloadVersion(fileId: string, version: number): Promise<void> {
  const file = await getWorkspaceFileById(fileId);
  if (!file) return;
  const text = version === file.version ? file.text : (await listWorkspaceVersions(fileId)).find((v) => v.version === version)?.text ?? '';
  downloadText(text, downloadName(file.path), downloadType(file.path, file.mimeType));
}

/**
 * The Workspace side panel (D-26): the chat's Files list, and a viewer that
 * opens a file at a given version with version navigation and download (D-28).
 */
export function WorkspacePanel({ threadId, libraryName, refreshKey, view, onView, onClose }: {
  threadId: string;
  libraryName?: string;
  /** Changes when the chat changes, so the panel reloads after a turn. */
  refreshKey: string;
  view: PanelView;
  onView: (view: PanelView) => void;
  onClose: () => void;
}) {
  return (
    <aside aria-label="Workspace files" className="absolute inset-y-0 right-0 z-30 w-full sm:w-[420px] shadow-2xl xl:static xl:z-auto xl:w-[440px] xl:shrink-0 xl:shadow-none flex flex-col min-h-0 border-l border-line bg-bg">
      {view.tab === 'files'
        ? <FilesList threadId={threadId} libraryName={libraryName} refreshKey={refreshKey} onOpen={(fileId) => onView({ tab: 'file', fileId })} onClose={onClose} />
        : <FileView fileId={view.fileId} version={view.version} refreshKey={refreshKey} onVersion={(version) => onView({ ...view, version })} onBack={() => onView({ tab: 'files' })} onClose={onClose} />}
    </aside>
  );
}

function PanelHeader({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 h-11 border-b border-line shrink-0">
      <div className="flex-1 min-w-0 flex items-center gap-2">{children}</div>
      <button onClick={onClose} aria-label="Close workspace panel" className="p-1 text-mute hover:text-text focus-visible:outline focus-visible:outline-accent"><X size={14} /></button>
    </div>
  );
}

function FilesList({ threadId, libraryName, refreshKey, onOpen, onClose }: { threadId: string; libraryName?: string; refreshKey: string; onOpen: (fileId: string) => void; onClose: () => void }) {
  const [files, setFiles] = useState<WorkspaceFile[] | null>(null);
  useEffect(() => {
    let live = true;
    void listWorkspaceFiles(threadId).then((items) => { if (live) setFiles(items); });
    return () => { live = false; };
  }, [threadId, refreshKey]);
  const groups = [
    { title: 'Uploads', icon: Upload, items: (files ?? []).filter((f) => f.kind === 'upload') },
    { title: 'Notes', icon: FileText, items: (files ?? []).filter((f) => f.kind === 'note') },
  ];
  return <>
    <PanelHeader onClose={onClose}><FolderOpen size={14} className="text-accent" /><span className="font-mono text-[12px] text-text">Files</span></PanelHeader>
    <div className="flex-1 overflow-y-auto p-3 space-y-4 font-mono text-[11px]">
      {groups.map(({ title, icon: Icon, items }) => (
        <section key={title}>
          <h3 className="text-[10px] uppercase tracking-widest text-mute mb-1.5">{title} · {items.length}</h3>
          {!items.length && <p className="text-mute border border-dashed border-line px-3 py-2">{title === 'Uploads' ? 'Attach files from the composer.' : 'The model has not written any notes yet.'}</p>}
          <ul className="space-y-1">
            {items.map((file) => (
              <li key={file.id}>
                <button onClick={() => onOpen(file.id)} className="w-full flex items-center gap-2 px-2.5 py-2 border border-line bg-surface hover:border-line-hi text-left focus-visible:outline focus-visible:outline-accent">
                  <Icon size={12} className="text-mute shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-text">{file.path.replace(/^\/(uploads|notes)\//, '')}</span>
                  <span className="shrink-0 text-mute">{file.kind === 'note' ? `v${file.version} · ` : ''}{fmtBytes(file.text.length)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest text-mute mb-1.5">Library</h3>
        <p className="text-mute">{libraryName ? <>The model can read <span className="text-text">{libraryName}</span> at /library (read-only). Browse it on the Knowledge page.</> : 'No library attached.'}</p>
      </section>
    </div>
  </>;
}

function FileView({ fileId, version, refreshKey, onVersion, onBack, onClose }: { fileId: string; version?: number; refreshKey: string; onVersion: (version: number) => void; onBack: () => void; onClose: () => void }) {
  const [file, setFile] = useState<WorkspaceFile | null | undefined>(undefined);
  const [versions, setVersions] = useState<WorkspaceVersion[]>([]);
  useEffect(() => {
    let live = true;
    void Promise.all([getWorkspaceFileById(fileId), listWorkspaceVersions(fileId)]).then(([f, v]) => { if (live) { setFile(f ?? null); setVersions(v); } });
    return () => { live = false; };
  }, [fileId, refreshKey]);
  if (file === undefined) return <PanelHeader onClose={onClose}><span className="font-mono text-[11px] text-mute">Loading…</span></PanelHeader>;
  if (file === null) return <>
    <PanelHeader onClose={onClose}><button onClick={onBack} aria-label="Back to files" className="p-1 text-mute hover:text-text"><ArrowLeft size={14} /></button><span className="font-mono text-[11px] text-mute">File not found</span></PanelHeader>
    <p className="p-4 font-mono text-[11px] text-mute">This file was deleted with its chat or is no longer available.</p>
  </>;
  const current = Math.min(Math.max(1, version ?? file.version), file.version);
  const record = versions.find((v) => v.version === current);
  const text = record?.text ?? (current === file.version ? file.text : '');
  // Provenance belongs to the version shown, not to whatever the latest copy was.
  const copiedFrom = record ? record.copiedFrom : current === file.version ? file.copiedFrom : undefined;
  const name = file.path.split('/').pop() ?? file.path;
  return <>
    <PanelHeader onClose={onClose}>
      <button onClick={onBack} aria-label="Back to files" className="p-1 text-mute hover:text-text focus-visible:outline focus-visible:outline-accent"><ArrowLeft size={14} /></button>
      <span className="font-mono text-[12px] text-text truncate" title={file.path}>{name}</span>
    </PanelHeader>
    <div className="flex items-center gap-2 px-3 py-2 border-b border-line font-mono text-[10px] text-mute shrink-0">
      {file.kind === 'note' ? (
        <div className="flex items-center gap-1" role="group" aria-label="Versions">
          <button onClick={() => onVersion(current - 1)} disabled={current <= 1} aria-label="Previous version" className="p-0.5 hover:text-text disabled:opacity-30"><ChevronLeft size={12} /></button>
          <span className="text-text">v{current}</span><span>of {file.version}</span>
          <button onClick={() => onVersion(current + 1)} disabled={current >= file.version} aria-label="Next version" className="p-0.5 hover:text-text disabled:opacity-30"><ChevronRight size={12} /></button>
        </div>
      ) : <span>upload · read-only</span>}
      <span className="flex-1 min-w-0 truncate">{record ? `${CHANGE_LABEL[record.change]} · ${fmtRelativeTime(record.createdAt)}` : ''}</span>
      <button onClick={() => void downloadVersion(file.id, current)} aria-label={`Download ${name} v${current}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-line hover:text-text hover:border-line-hi"><Download size={11} /> download</button>
    </div>
    {copiedFrom && <p className="px-3 py-1.5 border-b border-line font-mono text-[10px] text-mute shrink-0">
      copied from {copiedFrom.path}, lines {copiedFrom.startLine}–{copiedFrom.endLine}{copiedFrom.pageStart ? ` (p. ${copiedFrom.pageStart}${copiedFrom.pageEnd && copiedFrom.pageEnd !== copiedFrom.pageStart ? `–${copiedFrom.pageEnd}` : ''})` : ''}
    </p>}
    <div className="flex-1 overflow-auto p-4"><FileContent path={file.path} text={text} mimeType={file.mimeType} /></div>
  </>;
}
