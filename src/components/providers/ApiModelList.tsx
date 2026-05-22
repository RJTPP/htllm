import { useState, useEffect, useMemo } from 'react';
import type { ModelInfo } from '../../providers/types';
import type { OpenAICompatibleProvider } from '../../providers/openai-compat/index';
import { Search, Check } from 'lucide-react';

type LoadState =
  | { kind: 'unconfigured' }
  | { kind: 'loading' }
  | { kind: 'loaded'; models: ModelInfo[] }
  | { kind: 'error'; msg: string };

export function ApiModelList({
  provider,
  apiModelId,
  onSelect,
  onConfigure,
}: {
  provider: OpenAICompatibleProvider;
  apiModelId: string | null;
  onSelect: (modelId: string) => void;
  /** Jump to Settings → Providers to configure this endpoint. */
  onConfigure: () => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!provider.isConfigured()) {
      setState({ kind: 'unconfigured' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    provider
      .listModels()
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
  }, [provider]);

  const groups = useMemo(() => {
    if (state.kind !== 'loaded') return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? state.models.filter(
          (m) => m.id.toLowerCase().includes(q) || m.family.toLowerCase().includes(q),
        )
      : state.models;
    const map = new Map<string, ModelInfo[]>();
    for (const m of list) {
      const arr = map.get(m.family) ?? [];
      arr.push(m);
      map.set(m.family, arr);
    }
    return [...map.entries()]
      .map(([family, models]) => ({
        family,
        models: [...models].sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.family.localeCompare(b.family));
  }, [state, search]);

  if (state.kind === 'unconfigured') {
    return (
      <div className="p-8 flex flex-col items-center gap-3">
        <div className="text-center font-mono text-[12px] text-mute leading-relaxed">
          No endpoint configured for {provider.displayName}.
        </div>
        <button
          onClick={onConfigure}
          className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10"
        >
          Configure provider →
        </button>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className="p-8 text-center font-mono text-[12px] text-mute">Loading models…</div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="p-8 flex flex-col items-center gap-3">
        <div className="text-center font-mono text-[11px] text-err leading-relaxed break-all">
          {state.msg}
        </div>
        <button
          onClick={onConfigure}
          className="font-mono text-[11px] px-3 py-1.5 border border-line text-mute hover:text-text"
        >
          Check provider settings →
        </button>
      </div>
    );
  }

  const total = groups.reduce((n, g) => n + g.models.length, 0);

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-3 border-b border-line sticky top-0 bg-bg z-10">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">
            <Search size={15} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none pl-9 pr-3 py-2 text-[13px]"
          />
        </div>
      </div>
      <div className="p-4 space-y-4">
        {groups.map((g) => (
          <div key={g.family}>
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-1.5">
              {g.family} · {g.models.length}
            </div>
            <div className="space-y-1">
              {g.models.map((m) => {
                const selected = m.id === apiModelId;
                return (
                  <button
                    key={m.id}
                    onClick={() => onSelect(m.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 border text-left transition-colors ${
                      selected
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-line bg-surface hover:border-line-hi'
                    }`}
                  >
                    <span className="font-mono text-[12px] text-text truncate flex-1">
                      {m.id}
                    </span>
                    {selected && <Check size={13} className="text-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {total === 0 && (
          <div className="font-mono text-[12px] text-mute text-center py-12">
            No models match your search.
          </div>
        )}
      </div>
    </div>
  );
}
