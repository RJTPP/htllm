import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
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
  busyLibraryId,
  onSelect,
  onNew,
  onRemove,
  onEmbedAll,
}: {
  libraries: LibraryWithStats[];
  activeLibraryId: string;
  /** When set, the matching row shows a spinner — its docs are being embedded. */
  busyLibraryId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
  onEmbedAll: (id: string) => void;
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
          const canEmbed = Boolean(lib.embeddingModelId) && docCount > 0;
          const busy = busyLibraryId === lib.id;
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
                <div className="flex items-center gap-1.5 pr-12">
                  <span className="text-[12.5px] text-text truncate">{lib.name}</span>
                  {lib.useContextualRetrieval && (
                    <span
                      title="Contextual retrieval enabled — embeddings include a chat-model-generated situating blurb"
                      className="shrink-0 inline-flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-wider text-accent border border-accent/40 bg-accent/5 px-1 leading-[14px]"
                    >
                      <Sparkles size={8} />ctx
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px] text-mute mt-0.5 flex items-center gap-1">
                  <span>
                    {docCount} doc{docCount === 1 ? '' : 's'} · {chunkCount} chunk
                    {chunkCount === 1 ? '' : 's'}
                  </span>
                  {busy && (
                    <span className="flex items-center gap-1 text-accent">
                      · <Loader2 size={9} className="animate-spin" /> embedding…
                    </span>
                  )}
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

              {/* Hover row actions — embed (when applicable) and delete
                  (when not the Default library). Hidden until hover so
                  the list stays calm at rest. */}
              <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {canEmbed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEmbedAll(lib.id);
                    }}
                    title="Embed all documents in this library"
                    className="p-1 text-mute/70 hover:text-accent"
                  >
                    <Sparkles size={11} />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(lib.id);
                    }}
                    title="Delete library (and all its documents)"
                    className="p-1 text-mute/60 hover:text-err"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
