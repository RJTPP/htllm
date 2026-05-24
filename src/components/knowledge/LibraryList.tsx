import { Plus, Trash2 } from 'lucide-react';
import type { LibraryWithStats } from '../../hooks/useKnowledge';
import { DEFAULT_LIBRARY_ID } from '../../data/libraries';

/**
 * Left column of the 3-column Documents tab — lists every library with
 * doc/chunk counts and the pinned embedding model. Active selection has
 * an accent left-border to match the prototype's visual rhythm.
 */
export function LibraryList({
  libraries,
  activeLibraryId,
  onSelect,
  onNew,
  onRemove,
}: {
  libraries: LibraryWithStats[];
  activeLibraryId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col border-r border-line min-w-[180px] w-[210px]">
      <div className="px-3 py-2 border-b border-line flex items-center justify-between">
        <span className="font-mono text-[10px] text-mute uppercase tracking-widest">
          libraries · {libraries.length}
        </span>
        <button
          onClick={onNew}
          title="New library"
          className="text-mute hover:text-accent"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {libraries.map(({ lib, docCount, chunkCount }) => {
          const active = lib.id === activeLibraryId;
          const canDelete = lib.id !== DEFAULT_LIBRARY_ID;
          return (
            <div
              key={lib.id}
              className={`group relative border-l-2 ${
                active ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-surface2'
              }`}
            >
              <button
                onClick={() => onSelect(lib.id)}
                className="w-full text-left px-3 py-2"
              >
                <div className="text-[12.5px] text-text truncate">{lib.name}</div>
                <div className="font-mono text-[10px] text-mute mt-0.5">
                  {docCount} doc{docCount === 1 ? '' : 's'} · {chunkCount} chunk
                  {chunkCount === 1 ? '' : 's'}
                </div>
                {lib.embeddingModelId ? (
                  <div className="font-mono text-[9px] text-mute/70 mt-0.5 truncate">
                    {lib.embeddingModelId}
                  </div>
                ) : (
                  <div className="font-mono text-[9px] text-warn/80 mt-0.5">
                    no model pinned
                  </div>
                )}
              </button>
              {canDelete && active && (
                <button
                  onClick={() => onRemove(lib.id)}
                  title="Delete library (and all its documents)"
                  className="absolute top-1.5 right-1.5 p-1 text-mute/60 hover:text-err opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
