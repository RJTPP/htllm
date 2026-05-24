import { useState, useEffect, useMemo } from 'react';
import type {
  ModelInfo,
  SystemInfo,
  EngineStatus,
  LoadProgress,
  ModelParams,
} from '../../providers/types';
import { groupByModel, familyRank, brandForFamily, type GroupedModel } from '../../lib/model-meta';
import { fitFor } from '../../lib/fit';
import { getHttpProviders, WEBLLM_ID } from '../../providers/registry';
import { Search } from 'lucide-react';
import { BrandLogo } from '../ui/BrandLogo';
import { StatusPanel } from './StatusPanel';
import { ParamControls } from './ParamControls';
import { ModelGridCard } from './ModelGridCard';
import { ApiModelList } from './ApiModelList';
import { ProviderTabbedModal, type ProviderTabDescriptor } from './ProviderTabbedModal';

function FamilyChip({
  family,
  active,
  onClick,
}: {
  family: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border text-[12px] transition-colors ${
        active
          ? 'border-accent/60 bg-accent/10 text-text'
          : 'border-line text-mute hover:border-line-hi hover:text-text'
      }`}
    >
      <BrandLogo brand={brandForFamily(family)} size={17} />
      {family}
    </button>
  );
}

const minVramOf = (g: GroupedModel): number =>
  Math.min(...g.variants.map((v) => v.vramRequiredMB));

export function ModelPicker({
  open,
  onClose,
  models,
  loadedModelId,
  system,
  globalDefaults,
  engineStatus,
  loadProgress,
  onLoad,
  onUnload,
  onEvict,
  onParamsChange,
  defaultProviderId,
  apiModelId,
  onSelectApiModel,
  onConfigureProvider,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelInfo[];
  loadedModelId: string | null;
  system: SystemInfo | null;
  globalDefaults: ModelParams;
  engineStatus: EngineStatus;
  loadProgress: LoadProgress;
  onLoad: (id: string) => void;
  onUnload: () => void;
  onEvict: (id: string) => void;
  onParamsChange: (patch: Partial<ModelParams>) => void;
  defaultProviderId: string;
  apiModelId: string | null;
  onSelectApiModel: (providerId: string, modelId: string) => void;
  onConfigureProvider: () => void;
}) {
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState<string | null>(null);
  const [hideTooLarge, setHideTooLarge] = useState(true);
  const [showParams, setShowParams] = useState(false);
  const httpProviders = getHttpProviders();
  const [tab, setTab] = useState<string>(defaultProviderId);

  // Open the picker on the tab matching the active thread's provider.
  useEffect(() => {
    if (open) setTab(defaultProviderId);
  }, [open, defaultProviderId]);

  const grouped = useMemo(() => groupByModel(models), [models]);
  const mem = system?.deviceMemoryGB ?? null;

  const families = useMemo(() => {
    const set = new Set(grouped.map((g) => g.family));
    return [...set].sort((a, b) => familyRank(a) - familyRank(b) || a.localeCompare(b));
  }, [grouped]);

  const recommendedName = useMemo(() => {
    const sorted = [...grouped].sort((a, b) => minVramOf(a) - minVramOf(b));
    const r = sorted.find((g) => fitFor(minVramOf(g), mem).fits);
    return r ? r.name : null;
  }, [grouped, mem]);

  const filtered = useMemo(() => {
    let list = grouped;
    if (family) list = list.filter((g) => g.family === family);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) => g.name.toLowerCase().includes(q) || g.family.toLowerCase().includes(q),
      );
    }
    if (hideTooLarge) {
      list = list.filter((g) =>
        g.variants.some((v) => {
          const f = fitFor(v.vramRequiredMB, mem);
          return f.fits || f.tight || v.cached || v.id === loadedModelId;
        }),
      );
    }
    const rank = (g: GroupedModel) =>
      g.variants.some((v) => v.id === loadedModelId)
        ? 0
        : g.variants.some((v) => v.cached)
          ? 1
          : 2;
    return [...list].sort(
      (a, b) => rank(a) - rank(b) || minVramOf(a) - minVramOf(b),
    );
  }, [grouped, search, family, hideTooLarge, mem, loadedModelId]);

  const subtitle =
    tab === WEBLLM_ID
      ? `${filtered.length} chat models · runs in-browser via WebLLM`
      : 'API models · served by your configured endpoint';

  const tabDescriptors: ProviderTabDescriptor[] = [
    { id: WEBLLM_ID, label: 'In-browser · WebLLM', logoId: WEBLLM_ID },
    ...httpProviders.map((p) => ({
      id: p.id,
      label: p.displayName,
      logoId: p.id,
    })),
  ];

  const footer = (
    <>
      <button
        onClick={() => setShowParams((s) => !s)}
        className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-[11px] text-mute hover:text-text"
      >
        <span>default generation parameters</span>
        <span>{showParams ? '−' : '+'}</span>
      </button>
      {showParams && (
        <div className="px-4 pb-4">
          <ParamControls params={globalDefaults} onChange={onParamsChange} />
          <div className="font-mono text-[10px] text-mute mt-2.5">
            Applied to new threads. Per-thread overrides live in thread parameters.
          </div>
        </div>
      )}
    </>
  );

  return (
    <ProviderTabbedModal
      open={open}
      onClose={onClose}
      title="Model selection"
      subtitle={subtitle}
      width="max-w-4xl"
      tabs={tabDescriptors}
      activeTabId={tab}
      onTabChange={setTab}
      footer={footer}
    >
      {tab !== WEBLLM_ID ? (
        <div className="h-full overflow-y-auto">
          <ApiModelList
            provider={httpProviders.find((p) => p.id === tab) ?? httpProviders[0]!}
            apiModelId={apiModelId}
            onSelect={(modelId) => onSelectApiModel(tab, modelId)}
            onConfigure={onConfigureProvider}
          />
        </div>
      ) : (
        <div className="h-full overflow-y-auto">
          <div className="px-4 pt-3 border-b border-line space-y-3 sticky top-0 bg-bg z-10">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">
                <Search size={15} />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chat models…"
                className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none pl-9 pr-3 py-2 text-[13px]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFamily(null)}
                className={`px-3 py-1.5 border text-[12px] transition-colors ${
                  family === null
                    ? 'border-accent/60 bg-accent/10 text-text'
                    : 'border-line text-mute hover:text-text'
                }`}
              >
                All
              </button>
              {families.map((f) => (
                <FamilyChip
                  key={f}
                  family={f}
                  active={family === f}
                  onClick={() => setFamily(family === f ? null : f)}
                />
              ))}
            </div>
            <div className="flex items-center justify-between pb-3">
              <label className="flex items-center gap-2 font-mono text-[11px] text-mute cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideTooLarge}
                  onChange={(e) => setHideTooLarge(e.target.checked)}
                  className="accent-accent"
                />
                hide models too large for this device
              </label>
            </div>
            <div className="pb-3">
              <StatusPanel engineState={engineStatus} progress={loadProgress} />
            </div>
          </div>

          <div className="p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 items-start">
              {filtered.map((m) => (
                <ModelGridCard
                  key={m.name}
                  model={m}
                  system={system}
                  loadedId={loadedModelId}
                  recommended={m.name === recommendedName}
                  engineState={engineStatus}
                  onLoad={onLoad}
                  onUnload={onUnload}
                  onEvict={onEvict}
                />
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="font-mono text-[12px] text-mute text-center py-12">
                No models match your search.
              </div>
            )}
          </div>
        </div>
      )}
    </ProviderTabbedModal>
  );
}
