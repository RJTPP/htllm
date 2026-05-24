import { useState, useEffect } from 'react';
import { FileText, Trash2, Sparkles, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import { fmtBytes, fmtRelativeTime } from '../../lib/format';
import { getChunksForDocument } from '../../data/chunks';
import type { Chunk } from '../../providers/types';
import type { DocWithStatus } from '../../hooks/useKnowledge';

const STATUS_LABEL: Record<DocWithStatus['status'], string> = {
  none: 'not embedded',
  partial: 'partial',
  full: 'embedded',
  pending: 'embedding…',
  error: 'error',
};

const STATUS_CLASS: Record<DocWithStatus['status'], string> = {
  none: 'text-mute',
  partial: 'text-warn',
  full: 'text-accent',
  pending: 'text-text',
  error: 'text-err',
};

const INITIAL_CHUNK_PREVIEW = 4;
const CHUNK_LOAD_BATCH = 8;

/**
 * Right column of the 3-column Documents tab — full detail for the
 * selected document. Shows metadata, the first few chunks (so users can
 * sanity-check the ingestion), and per-doc actions (embed / remove).
 */
export function DocumentDetail({
  selected,
  busy,
  modelPinned,
  onEmbed,
  onRemove,
}: {
  selected: DocWithStatus | null;
  busy: boolean;
  /** True when the active library has an embedding model pinned. When
   *  false, the "embed" action is disabled with a hint. */
  modelPinned: boolean;
  onEmbed: () => void;
  onRemove: () => void;
}) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  // Render-only lazy load: we fetch all chunks once per doc (cheap at our
  // scale; IDB index scan over a few hundred records is sub-ms) but only
  // render the first slice. "Load more" expands the window without
  // re-hitting IDB.
  const [visibleCount, setVisibleCount] = useState(INITIAL_CHUNK_PREVIEW);

  useEffect(() => {
    if (!selected) {
      setChunks([]);
      setVisibleCount(INITIAL_CHUNK_PREVIEW);
      return;
    }
    let cancelled = false;
    setLoadingChunks(true);
    setVisibleCount(INITIAL_CHUNK_PREVIEW);
    getChunksForDocument(selected.doc.id).then((list) => {
      if (cancelled) return;
      setChunks(list);
      setLoadingChunks(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.doc.id]);

  if (!selected) {
    return (
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-3 py-2 border-b border-line font-mono text-[10px] text-mute uppercase tracking-widest">
          document preview
        </div>
        <div className="flex-1 flex items-center justify-center p-8 font-mono text-[11px] text-mute">
          Select a document on the left to preview it.
        </div>
      </div>
    );
  }

  const { doc, status, embeddedChunks } = selected;
  const effectiveStatus: DocWithStatus['status'] = busy ? 'pending' : status;
  const visibleChunks = chunks.slice(0, visibleCount);
  const remainingChunks = Math.max(chunks.length - visibleCount, 0);
  const nextBatch = Math.min(remainingChunks, CHUNK_LOAD_BATCH);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-3 py-2 border-b border-line font-mono text-[10px] text-mute uppercase tracking-widest">
        document preview
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="border border-line p-3 bg-bg/40 space-y-3">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-accent shrink-0" />
            <span className="font-mono text-[12.5px] text-text truncate">
              {doc.filename}
            </span>
          </div>

          <div className="font-mono text-[10px] text-mute space-y-0.5">
            <div>
              {doc.mimeType || 'text/plain'} · {fmtBytes(doc.sizeBytes)} · added{' '}
              {fmtRelativeTime(doc.createdAt)}
            </div>
            <div>
              {doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}
              {status === 'partial' && (
                <> · {embeddedChunks}/{doc.chunkCount} embedded</>
              )}
            </div>
            <div className={STATUS_CLASS[effectiveStatus]}>
              {effectiveStatus === 'pending' && (
                <Loader2 size={10} className="inline mr-1 animate-spin" />
              )}
              {effectiveStatus === 'error' && (
                <AlertTriangle size={10} className="inline mr-1" />
              )}
              {STATUS_LABEL[effectiveStatus]}
            </div>
          </div>

          {/* Chunk samples — sanity-check the ingestion. Truncate to the
              first few; the rest are summarized. */}
          <div className="space-y-1.5">
            {loadingChunks ? (
              <div className="font-mono text-[10px] text-mute py-3 text-center">
                loading chunks…
              </div>
            ) : (
              <>
                {visibleChunks.map((c) => (
                  <div
                    key={c.id}
                    className="font-mono text-[10.5px] text-text/70 border border-line/60 p-2 bg-surface/40 space-y-1"
                  >
                    <div className="text-mute">
                      chunk #{c.index + 1}
                      {c.headingPath && <span className="ml-1 text-accent/60">· {c.headingPath}</span>}
                    </div>
                    <div className="leading-relaxed line-clamp-3 whitespace-pre-wrap">
                      {c.text}
                    </div>
                  </div>
                ))}
                {remainingChunks > 0 && (
                  <button
                    onClick={() => setVisibleCount((n) => n + CHUNK_LOAD_BATCH)}
                    className="w-full flex items-center justify-center gap-1 font-mono text-[10px] text-mute hover:text-accent border border-line/60 hover:border-accent/40 py-1 transition-colors"
                  >
                    <ChevronDown size={11} /> load {nextBatch} more · {remainingChunks} left
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            {(status === 'none' || status === 'partial') && (
              <button
                onClick={onEmbed}
                disabled={!modelPinned || busy}
                title={
                  modelPinned
                    ? 'Embed this document under the library’s pinned model'
                    : 'Pin an embedding model to this library first'
                }
                className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Sparkles size={11} /> embed
              </button>
            )}
            <button
              onClick={onRemove}
              disabled={busy}
              className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 border border-line text-mute hover:text-err hover:border-err/40 disabled:opacity-30"
            >
              <Trash2 size={11} /> remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
