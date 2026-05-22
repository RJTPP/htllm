import type { Thread } from '../../providers/types';

export function ThreadList({
  threads,
  activeId,
  onCreate,
  onSelect,
  onDelete,
}: {
  threads: Thread[];
  activeId: string | null;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2">
        <button
          onClick={onCreate}
          className="w-full font-mono text-[11px] px-2.5 py-1.5 border border-line text-mute hover:bg-surface2 hover:text-text"
        >
          + new thread
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.map((t) => (
          <div
            key={t.id}
            className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors ${
              t.id === activeId
                ? 'border-accent bg-accent/5'
                : 'border-transparent hover:bg-surface2'
            }`}
            onClick={() => onSelect(t.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[12px] text-text truncate">
                {t.title || 'New thread'}
              </div>
              <div className="font-mono text-[10px] text-mute">
                {new Date(t.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(t.id);
              }}
              className="opacity-0 group-hover:opacity-100 font-mono text-[10px] text-mute hover:text-err px-1"
              title="Delete thread"
            >
              ×
            </button>
          </div>
        ))}
        {threads.length === 0 && (
          <div className="px-3 py-6 font-mono text-[11px] text-mute text-center">
            No threads yet
          </div>
        )}
      </div>
    </div>
  );
}
