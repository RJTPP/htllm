import { useState, useEffect } from 'react';
import type { Thread } from '../../providers/types';
import { Pencil, Trash2 } from 'lucide-react';
import { shortenModelId, fmtRelativeTime } from '../../lib/format';

export function ThreadItem({
  thread,
  active,
  onSelect,
  onDelete,
  onRename,
}: {
  thread: Thread;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thread.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const title = thread.title || 'New thread';

  const commit = () => {
    onRename(thread.id, draft.trim() || thread.title);
    setEditing(false);
  };

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  return (
    <div
      onClick={() => onSelect(thread.id)}
      className={`group px-2.5 py-2 cursor-pointer border-l-2 transition-colors ${
        active ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-surface2'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
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
              className="w-full bg-bg border border-accent/50 px-1.5 py-0.5 text-[12.5px] text-text focus:outline-none"
            />
          ) : (
            <div
              className="text-[12.5px] truncate text-text/90"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setDraft(thread.title);
                setEditing(true);
              }}
              title="Double-click to rename"
            >
              {title}
            </div>
          )}
          <div className="font-mono text-[10px] text-mute mt-0.5 truncate">
            {thread.modelId ? shortenModelId(thread.modelId) : 'no model'} ·{' '}
            {fmtRelativeTime(thread.updatedAt)}
          </div>
        </div>
        {!editing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDraft(thread.title);
                setEditing(true);
              }}
              className="p-1 text-mute hover:text-text"
              title="Rename"
            >
              <Pencil size={13} />
            </button>
            {confirmDelete ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(thread.id);
                }}
                className="font-mono text-[10px] px-1.5 py-0.5 border border-err/60 text-err hover:bg-err/10"
              >
                confirm
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="p-1 text-mute hover:text-err"
                title="Delete thread"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
