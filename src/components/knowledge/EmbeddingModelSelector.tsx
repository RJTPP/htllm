import { useState, useEffect, useMemo } from 'react';
import { Cloud, HardDrive, Search, Check, Plus, X, RefreshCw } from 'lucide-react';
import { getEmbeddingProviders, getProvider } from '../../providers/registry';
import type { EmbeddingModelInfo, EmbeddingProvider } from '../../providers/types';
import { Modal } from '../ui/Modal';
import { ProviderLogo } from '../ui/ProviderLogo';

interface ProviderTab {
  provider: EmbeddingProvider;
  displayName: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; models: EmbeddingModelInfo[] }
  | { kind: 'error'; msg: string };

/**
 * Embedding model picker — mirrors the chat ModelPicker UX: a centered
 * modal with a provider tab bar and a searchable model list per tab. Also
 * supports manual model id entry for providers (OpenRouter, custom
 * endpoints) that don't list embedding models in /v1/models.
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

  const summary = modelId ?? (compact ? 'no embed model' : 'Select embedding model');

  return (
    <>
      <button
        onClick={() => setOpen(true)}
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
          {compact && modelId ? (modelId.split('/').pop() ?? modelId).slice(0, 24) : summary}
        </span>
      </button>
      <EmbeddingModelModal
        open={open}
        onClose={() => setOpen(false)}
        activeProviderId={providerId}
        activeModelId={modelId}
        onSelect={(pid, mid) => {
          onSelect(pid, mid);
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * The modal body. Extracted so the trigger button stays tiny and the
 * heavier list/loading logic only mounts when open.
 */
function EmbeddingModelModal({
  open,
  onClose,
  activeProviderId,
  activeModelId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  activeProviderId: string | null;
  activeModelId: string | null;
  onSelect: (providerId: string, modelId: string) => void;
}) {
  const tabs: ProviderTab[] = useMemo(() => {
    return getEmbeddingProviders().map((provider) => ({
      provider,
      displayName: getProvider(provider.id)?.displayName ?? provider.id,
    }));
  }, []);

  const [tabId, setTabId] = useState<string>(
    activeProviderId ?? tabs[0]?.provider.id ?? '',
  );

  // Re-sync tab when reopened with a different active provider.
  useEffect(() => {
    if (open && activeProviderId) setTabId(activeProviderId);
  }, [open, activeProviderId]);

  const activeTab = tabs.find((t) => t.provider.id === tabId) ?? tabs[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Embedding model"
      subtitle="Models for document retrieval. Switching invalidates existing vectors."
      width="max-w-3xl"
    >
      {tabs.length === 0 ? (
        <div className="p-8 text-center font-mono text-[12px] text-mute">
          No embedding-capable providers configured. Add an OpenAI-compatible or
          Ollama provider in Settings → Providers.
        </div>
      ) : (
        <>
          <div className="flex border-b border-line overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.provider.id}
                onClick={() => setTabId(t.provider.id)}
                className={`flex items-center gap-1.5 font-mono text-[11px] px-4 py-2.5 border-r border-line whitespace-nowrap ${
                  tabId === t.provider.id ? 'text-accent bg-accent/5' : 'text-mute hover:text-text'
                }`}
              >
                <ProviderLogo providerId={t.provider.id} size={13} />
                {t.displayName}
              </button>
            ))}
          </div>
          {activeTab && (
            <EmbeddingProviderPanel
              tab={activeTab}
              activeProviderId={activeProviderId}
              activeModelId={activeModelId}
              onSelect={onSelect}
            />
          )}
        </>
      )}
    </Modal>
  );
}

/** Per-provider list + manual entry, modeled on ApiModelList. */
function EmbeddingProviderPanel({
  tab,
  activeProviderId,
  activeModelId,
  onSelect,
}: {
  tab: ProviderTab;
  activeProviderId: string | null;
  activeModelId: string | null;
  onSelect: (providerId: string, modelId: string) => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customId, setCustomId] = useState('');

  // Refresh model list when the active provider changes.
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    setCustomMode(false);
    setCustomId('');
    tab.provider
      .listEmbeddingModels()
      .then((models) => {
        if (!cancelled) setState({ kind: 'loaded', models });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ kind: 'error', msg: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab.provider]);

  const filtered = useMemo(() => {
    if (state.kind !== 'loaded') return [];
    const q = search.trim().toLowerCase();
    return q
      ? state.models.filter(
          (m) => m.id.toLowerCase().includes(q) || m.family.toLowerCase().includes(q),
        )
      : state.models;
  }, [state, search]);

  const submitCustom = () => {
    const id = customId.trim();
    if (!id) return;
    onSelect(tab.provider.id, id);
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-3 border-b border-line sticky top-0 bg-bg z-10 space-y-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">
            <Search size={15} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search embedding models…"
            className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none pl-9 pr-3 py-2 text-[13px]"
          />
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-mute">
          <span>
            {state.kind === 'loaded' && `${filtered.length} model${filtered.length === 1 ? '' : 's'}`}
            {state.kind === 'loading' && (
              <span className="inline-flex items-center gap-1">
                <RefreshCw size={10} className="animate-spin" /> loading…
              </span>
            )}
          </span>
          {!customMode && (
            <button
              onClick={() => setCustomMode(true)}
              className="inline-flex items-center gap-1 hover:text-text"
            >
              <Plus size={10} /> enter model id
            </button>
          )}
        </div>
        {customMode && (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCustom();
                else if (e.key === 'Escape') {
                  setCustomMode(false);
                  setCustomId('');
                }
              }}
              placeholder="e.g. text-embedding-3-small"
              className="flex-1 bg-surface border border-accent/60 focus:outline-none font-mono text-[12px] text-text px-2 py-1.5"
            />
            <button
              onClick={submitCustom}
              disabled={!customId.trim()}
              className="font-mono text-[11px] px-2.5 py-1.5 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30"
            >
              <Check size={11} />
            </button>
            <button
              onClick={() => {
                setCustomMode(false);
                setCustomId('');
              }}
              className="font-mono text-[11px] px-2.5 py-1.5 border border-line text-mute hover:text-text"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      <div className="p-4">
        {state.kind === 'error' && (
          <div className="text-center space-y-2 py-8">
            <div className="font-mono text-[11px] text-err leading-relaxed break-all">
              {state.msg}
            </div>
            <div className="font-mono text-[10px] text-mute">
              Try entering the model id manually above.
            </div>
          </div>
        )}

        {state.kind === 'loaded' && filtered.length === 0 && (
          <div className="text-center py-12 space-y-1.5">
            <div className="font-mono text-[12px] text-mute">
              {search.trim()
                ? 'No models match your search.'
                : 'This provider does not list embedding models in /v1/models.'}
            </div>
            <div className="font-mono text-[10px] text-mute/70">
              Use “enter model id” above if you know the model name.
            </div>
          </div>
        )}

        {state.kind === 'loaded' && filtered.length > 0 && (
          <div className="space-y-1">
            {filtered.map((m) => {
              const selected = activeProviderId === tab.provider.id && activeModelId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onSelect(tab.provider.id, m.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 border text-left transition-colors ${
                    selected
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-line bg-surface hover:border-line-hi'
                  }`}
                >
                  {m.offDevice ? (
                    <Cloud size={12} className="text-mute shrink-0" />
                  ) : (
                    <HardDrive size={12} className="text-mute shrink-0" />
                  )}
                  <span className="font-mono text-[12px] text-text truncate flex-1">
                    {m.id}
                  </span>
                  {m.offDevice && (
                    <span className="font-mono text-[9px] text-mute/70 border border-line/60 px-1 shrink-0">
                      off-device
                    </span>
                  )}
                  {selected && <Check size={13} className="text-accent shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
