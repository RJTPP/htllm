import { FileText, Sparkles, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { fmtBytes } from '../../lib/format';
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
  partial: 'text-yellow-500',
  full: 'text-accent',
  pending: 'text-text',
  error: 'text-err',
};

/**
 * Table-like list of ingested documents. Each row shows status under the
 * active embedding model and surfaces per-doc actions: embed, delete.
 */
export function DocumentList({
  docs,
  busyDocIds,
  modelSelected,
  onEmbed,
  onDelete,
}: {
  docs: DocWithStatus[];
  busyDocIds: Set<string>;
  modelSelected: boolean;
  onEmbed: (docId: string) => void;
  onDelete: (docId: string) => void;
}) {
  if (docs.length === 0) {
    return (
      <div className="border border-line bg-surface/40 p-4 text-center font-mono text-[11px] text-mute">
        No documents yet. Drop a file above to get started.
      </div>
    );
  }
  return (
    <div className="border border-line bg-surface/40 divide-y divide-line/40">
      {docs.map(({ doc, status, embeddedChunks }) => {
        const busy = busyDocIds.has(doc.id);
        const effectiveStatus: DocWithStatus['status'] = busy ? 'pending' : status;
        return (
          <div
            key={doc.id}
            className="flex items-center gap-3 px-3 py-2"
          >
            <FileText size={14} className="text-mute shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] text-text truncate">
                {doc.filename}
              </div>
              <div className="font-mono text-[10px] text-mute">
                {fmtBytes(doc.sizeBytes)} · {doc.chunkCount} chunk
                {doc.chunkCount === 1 ? '' : 's'}
                {status === 'partial' && (
                  <> · {embeddedChunks}/{doc.chunkCount} embedded</>
                )}
              </div>
            </div>
            <div className={`font-mono text-[10px] ${STATUS_CLASS[effectiveStatus]}`}>
              {effectiveStatus === 'pending' && (
                <Loader2 size={10} className="inline mr-1 animate-spin" />
              )}
              {effectiveStatus === 'error' && (
                <AlertTriangle size={10} className="inline mr-1" />
              )}
              {STATUS_LABEL[effectiveStatus]}
            </div>
            <div className="flex items-center gap-1">
              {(status === 'none' || status === 'partial') && modelSelected && !busy && (
                <button
                  onClick={() => onEmbed(doc.id)}
                  className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 border border-line text-mute hover:text-accent hover:border-accent/40"
                >
                  <Sparkles size={10} /> embed
                </button>
              )}
              <button
                onClick={() => onDelete(doc.id)}
                disabled={busy}
                className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 border border-line text-mute hover:text-err hover:border-err/60 disabled:opacity-30"
                title="Delete document"
              >
                <Trash2 size={10} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
