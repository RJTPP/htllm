import { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Upload, FilePlus, X, Check, AlertTriangle } from 'lucide-react';
import { fmtBytes } from '../../lib/format';
import type { LibraryWithStats } from '../../hooks/useKnowledge';

/**
 * Add-documents modal — picks the target library, accepts files, and
 * runs the upload through the parent's uploadFiles callback. Stages:
 *
 *   pick    — choose library + files
 *   running — ingestion in flight (parent shows progress)
 *   done    — confirmation; user can add more or close
 */
export function AddDocumentsModal({
  open,
  onClose,
  libraries,
  defaultLibraryId,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  libraries: LibraryWithStats[];
  defaultLibraryId: string;
  onUpload: (files: File[], libraryId: string) => Promise<void>;
}) {
  const [libraryId, setLibraryId] = useState<string>(defaultLibraryId);
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<'pick' | 'running' | 'done'>('pick');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setLibraryId(defaultLibraryId);
      setFiles([]);
      setStage('pick');
      setDragging(false);
    }
  }, [open, defaultLibraryId]);

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((prev) => [...prev, ...incoming]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleStart = async () => {
    if (files.length === 0) return;
    setStage('running');
    try {
      await onUpload(files, libraryId);
      setStage('done');
    } catch {
      // Errors surface through the parent's error banner.
      setStage('done');
    }
  };

  const targetLibrary = libraries.find((l) => l.lib.id === libraryId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add documents"
      subtitle="Ingest files into a library — they'll be chunked and stored for retrieval."
      width="max-w-lg"
    >
      <div className="p-4 space-y-4">
        {/* Library picker */}
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] text-mute uppercase tracking-widest">
            target library
          </label>
          <div className="space-y-1">
            {libraries.map(({ lib, docCount, chunkCount }) => {
              const selected = lib.id === libraryId;
              return (
                <button
                  key={lib.id}
                  onClick={() => setLibraryId(lib.id)}
                  disabled={stage !== 'pick'}
                  className={`w-full text-left px-3 py-2 border transition-colors ${
                    selected
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-line bg-surface hover:border-line-hi'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] text-text truncate">{lib.name}</span>
                    {selected && <Check size={12} className="text-accent shrink-0" />}
                  </div>
                  <div className="font-mono text-[10px] text-mute mt-0.5">
                    {docCount} doc{docCount === 1 ? '' : 's'} · {chunkCount} chunk
                    {chunkCount === 1 ? '' : 's'}
                    {lib.embeddingModelId ? (
                      <> · {lib.embeddingModelId}</>
                    ) : (
                      <span className="text-warn"> · no model pinned</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {targetLibrary && !targetLibrary.lib.embeddingModelId && (
            <div className="font-mono text-[10px] text-warn flex items-start gap-1">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              Ingesting now is fine — but you&apos;ll need to pin an embedding model
              before this library is searchable.
            </div>
          )}
        </div>

        {/* File picker / drop zone (pick stage only) */}
        {stage === 'pick' && (
          <div className="space-y-2">
            <label className="font-mono text-[10px] text-mute uppercase tracking-widest">
              files
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
              className={`border border-dashed p-5 text-center transition-colors ${
                dragging
                  ? 'border-accent bg-accent/5'
                  : 'border-line bg-surface/40 hover:border-accent/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
              <Upload size={20} className="mx-auto text-mute mb-1.5" />
              <div className="font-mono text-[11px] text-text mb-1">
                Drop files here, or
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 font-mono text-[10px] px-2.5 py-1 border border-line text-mute hover:text-text hover:border-accent/40"
              >
                <FilePlus size={11} /> browse files
              </button>
              <div className="font-mono text-[9px] text-mute mt-2">
                Supported: .txt, .md · PDF coming soon
              </div>
            </div>

            {/* Selected files preview */}
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 border border-line/60 bg-bg/40 px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-text truncate">{f.name}</div>
                      <div className="font-mono text-[10px] text-mute">{fmtBytes(f.size)}</div>
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      className="p-1 text-mute hover:text-err"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Running stage — minimal, parent shows the global progress bar */}
        {stage === 'running' && (
          <div className="font-mono text-[11px] text-mute py-2 text-center">
            Ingesting {files.length} file{files.length === 1 ? '' : 's'}…
          </div>
        )}

        {/* Done stage */}
        {stage === 'done' && (
          <div className="font-mono text-[11px] text-accent py-2 text-center flex items-center justify-center gap-1.5">
            <Check size={13} /> Added {files.length} file{files.length === 1 ? '' : 's'} to {targetLibrary?.lib.name ?? 'library'}
          </div>
        )}

        {/* Action row */}
        <div className="flex justify-end gap-2 pt-1">
          {stage === 'pick' && (
            <>
              <button
                onClick={onClose}
                className="font-mono text-[11px] px-3 py-1.5 border border-line text-mute hover:text-text"
              >
                cancel
              </button>
              <button
                onClick={handleStart}
                disabled={files.length === 0}
                className="flex items-center gap-1 font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30"
              >
                <Upload size={12} /> ingest {files.length > 0 && `(${files.length})`}
              </button>
            </>
          )}
          {stage === 'done' && (
            <>
              <button
                onClick={() => {
                  setFiles([]);
                  setStage('pick');
                }}
                className="font-mono text-[11px] px-3 py-1.5 border border-line text-mute hover:text-text"
              >
                add more
              </button>
              <button
                onClick={onClose}
                className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10"
              >
                done
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
