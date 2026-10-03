import { useState, useRef, type DragEvent } from 'react';
import { Upload, FilePlus } from 'lucide-react';

/**
 * Drop zone + file picker for ingesting .txt and .md files. Mirrors the
 * Composer's drag-drop pattern so the interaction feels consistent.
 */
export function DocumentUpload({
  onUpload,
  disabled = false,
}: {
  onUpload: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = '.txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf';

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onUpload(files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border border-dashed p-6 text-center transition-colors ${
        disabled
          ? 'border-line/40 bg-surface/20 cursor-not-allowed'
          : dragging
            ? 'border-accent bg-accent/5'
            : 'border-line bg-surface/40 hover:border-accent/40'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onUpload(files);
          // Reset so re-selecting the same file fires again.
          e.target.value = '';
        }}
      />
      <Upload size={24} className="mx-auto text-mute mb-2" />
      <div className="font-mono text-[11px] text-text mb-1">
        Drop files here, or
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="inline-flex items-center gap-1 font-mono text-[10px] px-2.5 py-1 border border-line text-mute hover:text-text hover:border-accent/40 disabled:opacity-40"
      >
        <FilePlus size={11} /> browse files
      </button>
      <div className="font-mono text-[9px] text-mute mt-3">
        Supported: .txt, .md, text PDFs · scanned PDFs are not supported
      </div>
    </div>
  );
}
