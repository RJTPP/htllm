import { useState } from 'react';
import { Database, Cloud, HardDrive } from 'lucide-react';
import { EmbeddingModelModal } from '../knowledge/EmbeddingModelSelector';
import { useEmbeddingModel } from '../../hooks/useEmbeddingModel';
import { getProvider } from '../../providers/registry';
import { OpenAICompatibleProvider } from '../../providers/openai-compat/index';
import { localityOf } from '../../lib/network';

/**
 * Header chip showing the active embedding model. Mirrors ModelSlot's
 * visual language so the two sit naturally side-by-side in the top header.
 * Click → opens the same Modal-style picker used everywhere else.
 *
 * Reads useEmbeddingModel directly — no prop drilling since embedding
 * state is global (per-app, not per-thread).
 */
export function EmbeddingSlot() {
  const { providerId, modelId, setEmbeddingModel } = useEmbeddingModel();
  const [pickerOpen, setPickerOpen] = useState(false);

  const isReady = Boolean(providerId && modelId);

  // Cloud vs hard-drive icon derived from the active provider's configured
  // baseURL — same locality rule the picker uses, so the two views agree.
  const provider = providerId ? getProvider(providerId) : null;
  const baseURL =
    provider instanceof OpenAICompatibleProvider
      ? provider.getConfig().baseURL
      : '';
  const locality = localityOf(baseURL);
  const offDevice = locality === 'off-device';

  // Trim long model ids — show the last segment for hf-style "vendor/name"
  // paths, otherwise the full id. Keeps the chip narrow next to ModelSlot.
  const display = modelId
    ? (modelId.includes('/') ? modelId.split('/').pop()! : modelId).slice(0, 28)
    : 'select…';

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        title={
          modelId
            ? `Embedding model · ${modelId}`
            : 'Choose embedding model for RAG / semantic search'
        }
        className={`group flex items-center gap-2 pl-1.5 pr-2.5 py-1 border transition-colors min-w-0 ${
          isReady
            ? 'border-line bg-surface hover:border-line-hi'
            : 'border-line bg-surface/60 hover:border-accent/50'
        }`}
      >
        <span className="w-5 h-5 shrink-0 flex items-center justify-center text-mute">
          {isReady ? (
            offDevice ? (
              <Cloud size={14} />
            ) : (
              <HardDrive size={14} />
            )
          ) : (
            <Database size={14} />
          )}
        </span>
        <div className="flex flex-col items-start min-w-0 leading-tight">
          <span className="font-mono text-[9px] uppercase tracking-widest text-mute">
            embed
          </span>
          <div className="flex items-center gap-1.5 max-w-[200px]">
            <span
              className={`font-mono text-[11px] truncate ${
                isReady ? 'text-text' : 'text-mute'
              }`}
            >
              {display}
            </span>
          </div>
        </div>
      </button>

      <EmbeddingModelModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        activeProviderId={providerId}
        activeModelId={modelId}
        onSelect={(pid, mid) => {
          setEmbeddingModel(pid, mid);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
