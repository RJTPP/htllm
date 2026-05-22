import { useState } from 'react';
import type { Thread, Folder } from '../../providers/types';
import { Plus, FolderPlus } from 'lucide-react';
import { ThreadItem } from './ThreadItem';
import { FolderSection } from './FolderSection';

export function Sidebar({
  threads,
  folders,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onMoveThread,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  locked,
}: {
  threads: Thread[];
  folders: Folder[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onMoveThread: (id: string, folderId: string | null) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  /** While a generation is in progress the thread list is locked so the
   *  active thread can't change mid-stream. */
  locked: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newFolder, setNewFolder] = useState<string | null>(null);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Group threads by folder; threads with no (or a dangling) folderId are
  // ungrouped. Per-folder order inherits the incoming most-recent-first sort.
  const folderIds = new Set(folders.map((f) => f.id));
  const grouped = new Map<string, Thread[]>();
  const ungrouped: Thread[] = [];
  for (const t of threads) {
    if (t.folderId && folderIds.has(t.folderId)) {
      const arr = grouped.get(t.folderId) ?? [];
      arr.push(t);
      grouped.set(t.folderId, arr);
    } else {
      ungrouped.push(t);
    }
  }

  const threadProps = {
    folders,
    onSelect,
    onDelete,
    onRename,
    onMove: onMoveThread,
  };

  const commitNewFolder = () => {
    const name = (newFolder ?? '').trim();
    if (name) onCreateFolder(name);
    setNewFolder(null);
  };

  // While locked, thread rows are non-interactive so the active thread
  // can't change. The current thread stays bright; others dim.
  const renderThread = (t: Thread) => {
    const isActive = t.id === activeId;
    return (
      <div
        key={t.id}
        className={
          locked
            ? isActive
              ? 'pointer-events-none'
              : 'pointer-events-none opacity-50'
            : undefined
        }
      >
        <ThreadItem thread={t} active={isActive} {...threadProps} />
      </div>
    );
  };

  return (
    <aside className="reveal reveal-2 w-[248px] shrink-0 border-r border-line bg-surface flex flex-col">
      <div className="px-3 py-2.5">
        <button
          onClick={onNew}
          disabled={locked}
          className="w-full flex items-center justify-center gap-1.5 font-mono text-[11px] px-2.5 py-2 border border-line text-text bg-bg hover:border-accent/50 hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-text"
        >
          <Plus size={13} /> new chat
        </button>
        {locked && (
          <div className="mt-1.5 font-mono text-[10px] text-mute/70 text-center">
            generating — stop to switch threads
          </div>
        )}
      </div>

      <div className="px-3 pb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] text-mute uppercase tracking-widest">
          threads · {threads.length}
        </span>
        <button
          onClick={() => setNewFolder('')}
          className="flex items-center gap-1 font-mono text-[10px] text-mute hover:text-accent"
          title="New folder"
        >
          <FolderPlus size={12} /> folder
        </button>
      </div>

      {newFolder !== null && (
        <div className="px-3 pb-1">
          <input
            autoFocus
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onBlur={commitNewFolder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNewFolder();
              if (e.key === 'Escape') setNewFolder(null);
            }}
            placeholder="Folder name…"
            className="w-full bg-bg border border-accent/50 px-1.5 py-1 text-[11px] font-mono text-text focus:outline-none"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-0.5">
        {folders.map((folder) => {
          const inFolder = grouped.get(folder.id) ?? [];
          return (
            <FolderSection
              key={folder.id}
              folder={folder}
              count={inFolder.length}
              collapsed={collapsed.has(folder.id)}
              onToggle={() => toggle(folder.id)}
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
            >
              {inFolder.map(renderThread)}
              {inFolder.length === 0 && (
                <div className="px-2.5 py-1.5 font-mono text-[10px] text-mute/60">
                  empty
                </div>
              )}
            </FolderSection>
          );
        })}

        {folders.length > 0 && ungrouped.length > 0 && (
          <div className="px-1.5 pt-2 pb-1 font-mono text-[10px] uppercase tracking-wide text-mute/60">
            ungrouped
          </div>
        )}
        {ungrouped.map(renderThread)}

        {threads.length === 0 && (
          <div className="px-2.5 py-6 font-mono text-[11px] text-mute text-center">
            No threads yet
          </div>
        )}
      </div>
    </aside>
  );
}
