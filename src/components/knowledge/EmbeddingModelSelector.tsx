import { useState, useEffect } from 'react';
import { Cloud, HardDrive, RefreshCw, ChevronDown, Plus, Check, X } from 'lucide-react';
import { getEmbeddingProviders, getProvider } from '../../providers/registry';
import type { EmbeddingModelInfo, EmbeddingProvider } from '../../providers/types';

interface Group {
  provider: EmbeddingProvider;
  /** Pulled from the matching ChatProvider — EmbeddingProvider doesn't carry it. */
  displayName: string;
  models: EmbeddingModelInfo[];
  error?: string;
  loading: boolean;
}

/**
 * Dropdown listing embedding models from every embedding-capable provider,
 * grouped by provider with an off-device badge for cloud models. Selection
 * is communicated up through onSelect — persistence lives in useEmbeddingModel.
 */
export function EmbeddingModelSelector({
  providerId,
  modelId,
  onSelect,
  compact = false,
}: {
  providerId: string | null;
  modelId: string | null;
  onSelect: (providerId: string, modelId: string) => void;
  /** Slimmer trigger button for chat footer placement. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [customForProvider, setCustomForProvider] = useState<string | null>(null);
  const [customModelId, setCustomModelId] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const providers = getEmbeddingProviders();
    const displayNameFor = (id: string) => getProvider(id)?.displayName ?? id;
    setGroups(
      providers.map((provider) => ({
        provider,
        displayName: displayNameFor(provider.id),
        models: [],
        loading: true,
      })),
    );
    providers.forEach((provider, idx) => {
      provider
        .listEmbeddingModels()
        .then((models) => {
          if (cancelled) return;
          setGroups((g) => {
            const next = [...g];
            next[idx] = {
              provider,
              displayName: displayNameFor(provider.id),
              models,
              loading: false,
            };
            return next;
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setGroups((g) => {
            const next = [...g];
            next[idx] = {
              provider,
              displayName: displayNameFor(provider.id),
              models: [],
              loading: false,
              error: err instanceof Error ? err.message : String(err),
            };
            return next;
          });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const summary = modelId ?? (compact ? 'no embed model' : 'Select embedding model');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={modelId ? `Embedding · ${modelId}` : 'Choose embedding model'}
        className={
          compact
            ? `flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border ${
                modelId
                  ? 'border-accent/40 text-accent hover:bg-accent/10'
                  : 'border-line text-mute/70 hover:text-mute'
              }`
            : 'flex items-center gap-2 font-mono text-[11px] px-2.5 py-1.5 border border-line bg-bg hover:border-accent/40'
        }
      >
        {compact && <span className="text-mute/60">embed:</span>}
        <span className={modelId ? '' : compact ? 'text-mute/70' : 'text-mute'}>
          {compact && modelId ? modelId.split('/').pop()?.slice(0, 20) : summary}
        </span>
        <ChevronDown size={compact ? 10 : 12} className="text-mute" />
      </button>
      {open && (
        <>
          {/* click-outside */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[320px] max-h-[60vh] overflow-y-auto border border-line bg-surface shadow-lg">
            {groups.map((g) => (
              <div key={g.provider.id} className="border-b border-line/40 last:border-0">
                <div className="px-3 py-1.5 flex items-center gap-2 bg-bg/40 sticky top-0">
                  <span className="font-mono text-[10px] text-mute uppercase tracking-wider">
                    {g.displayName}
                  </span>
                  {g.loading && (
                    <RefreshCw size={10} className="text-mute animate-spin" />
                  )}
                </div>
                {g.error && (
                  <div className="px-3 py-2 font-mono text-[10px] text-err/70">
                    {g.error}
                  </div>
                )}
                {!g.loading && !g.error && g.models.length === 0 && (
                  <div className="px-3 py-2 font-mono text-[10px] text-mute">
                    No embedding models available.
                  </div>
                )}
                {g.models.map((m) => {
                  const active = providerId === g.provider.id && modelId === m.id;
                  return (
                    <button
                      key={`${g.provider.id}:${m.id}`}
                      onClick={() => {
                        onSelect(g.provider.id, m.id);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                        active
                          ? 'bg-accent/10 text-accent'
                          : 'text-text hover:bg-surface2'
                      }`}
                    >
                      {m.offDevice ? (
                        <Cloud size={11} className="text-mute shrink-0" />
                      ) : (
                        <HardDrive size={11} className="text-mute shrink-0" />
                      )}
                      <span className="font-mono text-[11px] truncate flex-1">{m.id}</span>
                      {m.offDevice && (
                        <span className="font-mono text-[9px] text-mute/70 border border-line/60 px-1">
                          off-device
                        </span>
                      )}
                    </button>
                  );
                })}
                {/* Manual model id entry — some providers (OpenRouter et al.)
                    don't list embedding models in /v1/models but still accept
                    a custom id at /v1/embeddings. */}
                {customForProvider === g.provider.id ? (
                  <div className="px-3 py-2 flex items-center gap-1.5 bg-bg/40">
                    <input
                      autoFocus
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customModelId.trim()) {
                          onSelect(g.provider.id, customModelId.trim());
                          setCustomForProvider(null);
                          setCustomModelId('');
                          setOpen(false);
                        } else if (e.key === 'Escape') {
                          setCustomForProvider(null);
                          setCustomModelId('');
                        }
                      }}
                      placeholder="e.g. text-embedding-3-small"
                      className="flex-1 bg-bg border border-line focus:border-accent/60 font-mono text-[11px] text-text px-2 py-1 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (!customModelId.trim()) return;
                        onSelect(g.provider.id, customModelId.trim());
                        setCustomForProvider(null);
                        setCustomModelId('');
                        setOpen(false);
                      }}
                      disabled={!customModelId.trim()}
                      className="p-1 text-accent hover:bg-accent/10 disabled:opacity-30"
                    >
                      <Check size={11} />
                    </button>
                    <button
                      onClick={() => {
                        setCustomForProvider(null);
                        setCustomModelId('');
                      }}
                      className="p-1 text-mute hover:text-text"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCustomForProvider(g.provider.id)}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-mute hover:bg-surface2 hover:text-text"
                  >
                    <Plus size={11} />
                    <span className="font-mono text-[10px]">enter model id…</span>
                  </button>
                )}
              </div>
            ))}
            {groups.length === 0 && (
              <div className="px-3 py-3 font-mono text-[10px] text-mute">
                No embedding-capable providers configured. Add an OpenAI-compat
                or Ollama provider in Settings.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
