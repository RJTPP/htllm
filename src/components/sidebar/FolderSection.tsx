import { useState, useEffect, type ReactNode } from 'react';
import type { Folder } from '../../providers/types';
import { ChevronRight, Trash2 } from 'lucide-react';

/**
 * A collapsible sidebar section for one folder. The threads themselves are
 * passed as children so this component only owns the folder header.
 */
export function FolderSection({
  folder,
  count,
  collapsed,
  onToggle,
  onRename,
  onDelete,
  children,
}: {
  folder: Folder;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const commit = () => {
    onRename(folder.id, draft.trim() || folder.name);
    setEditing(false);
  };

  return (
    <div>
      <div
        onClick={onToggle}
        className="group/folder flex items-center gap-1 px-1.5 py-1 cursor-pointer hover:bg-surface2"
      >
        <ChevronRight
          size={12}
          className={`text-mute shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-bg border border-accent/50 px-1.5 py-0.5 text-[11px] font-mono text-text focus:outline-none"
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate font-mono text-[11px] uppercase tracking-wide text-text/80"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(folder.name);
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {folder.name}
          </span>
        )}
        <span className="font-mono text-[10px] text-mute shrink-0">{count}</span>
        {!editing && (
          <div className="opacity-0 group-hover/folder:opacity-100 shrink-0">
            {confirmDelete ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(folder.id);
                }}
                className="font-mono text-[9px] px-1 py-0.5 border border-err/60 text-err hover:bg-err/10"
              >
                confirm
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="p-0.5 text-mute hover:text-err"
                title="Delete folder (threads become ungrouped)"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="space-y-0.5 pl-3 ml-2 border-l border-line">{children}</div>
      )}
    </div>
  );
}
