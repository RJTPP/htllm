import { useState, useEffect } from 'react';
import { Cloud, HardDrive, RefreshCw, ChevronDown } from 'lucide-react';
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
}: {
  providerId: string | null;
  modelId: string | null;
  onSelect: (providerId: string, modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);

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

  const summary = modelId ?? 'Select embedding model';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 font-mono text-[11px] px-2.5 py-1.5 border border-line bg-bg hover:border-accent/40"
      >
        <span className={modelId ? 'text-text' : 'text-mute'}>{summary}</span>
        <ChevronDown size={12} className="text-mute" />
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
