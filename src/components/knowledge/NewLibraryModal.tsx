import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { EmbeddingModelModal } from './EmbeddingModelSelector';
import { Check, Pencil } from 'lucide-react';

/**
 * Create-a-library modal. Library name plus the embedding model the
 * library will be pinned to (vectors from different models can't be
 * cross-compared, so each library owns one model).
 *
 * Embedding model selection is optional at creation — the library can
 * start unpinned and commit a model on first ingestion. We surface this
 * tradeoff inline so users understand they'll be asked again later.
 */
export function NewLibraryModal({
  open,
  onClose,
  defaultProviderId,
  defaultModelId,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the embedding model with the user's active selection. */
  defaultProviderId: string | null;
  defaultModelId: string | null;
  onCreate: (input: {
    name: string;
    embeddingProviderId?: string;
    embeddingModelId?: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [providerId, setProviderId] = useState<string | null>(defaultProviderId);
  const [modelId, setModelId] = useState<string | null>(defaultModelId);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Reset to defaults whenever the modal is opened.
  useEffect(() => {
    if (open) {
      setName('');
      setProviderId(defaultProviderId);
      setModelId(defaultModelId);
    }
  }, [open, defaultProviderId, defaultModelId]);

  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({
      name: name.trim(),
      ...(providerId && modelId
        ? { embeddingProviderId: providerId, embeddingModelId: modelId }
        : {}),
    });
    onClose();
  };

  return (
    <>
      <Modal
        open={open && !pickerOpen}
        onClose={onClose}
        title="New library"
        subtitle="A library groups documents indexed under one embedding model."
        width="max-w-md"
      >
        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-mute uppercase tracking-widest">
              name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) handleCreate();
              }}
              autoFocus
              placeholder="e.g. Project docs"
              className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-2 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-mute uppercase tracking-widest">
              embedding model
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center justify-between gap-2 bg-surface border border-line hover:border-accent/40 px-3 py-2 text-left transition-colors"
            >
              {modelId ? (
                <span className="font-mono text-[12px] text-text truncate">{modelId}</span>
              ) : (
                <span className="font-mono text-[12px] text-mute">
                  pick a model — required to embed
                </span>
              )}
              <Pencil size={12} className="text-mute shrink-0" />
            </button>
            <p className="font-mono text-[10px] text-mute/70 leading-relaxed">
              Switching this later requires re-embedding every document in the
              library. You can leave it unset and pick on first embed.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-[11px] px-3 py-1.5 border border-line text-mute hover:text-text"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate}
              className="flex items-center gap-1 font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30"
            >
              <Check size={12} /> create library
            </button>
          </div>
        </div>
      </Modal>

      <EmbeddingModelModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        activeProviderId={providerId}
        activeModelId={modelId}
        onSelect={(pid, mid) => {
          setProviderId(pid);
          setModelId(mid);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
