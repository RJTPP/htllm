import { useState, useMemo } from 'react';
import type {
  ModelInfo,
  SystemInfo,
  ModelParams,
  EngineStatus,
  LoadProgress,
} from '../../providers/types';
import { fitFor } from '../../lib/fit';
import { groupByFamily } from '../../providers/webllm/model-list';
import { Modal } from '../ui/Modal';
import { ModelCard } from './ModelCard';
import { ModelParamsPanel } from './ModelParams';
import { StatusPanel } from './StatusPanel';

export function ModelPicker({
  open,
  onClose,
  models,
  loadedModelId,
  system,
  params,
  engineStatus,
  loadProgress,
  onLoad,
  onUnload,
  onEvict,
  onParamsChange,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelInfo[];
  loadedModelId: string | null;
  system: SystemInfo | null;
  params: ModelParams;
  engineStatus: EngineStatus;
  loadProgress: LoadProgress;
  onLoad: (id: string) => void;
  onUnload: () => void;
  onEvict: (id: string) => void;
  onParamsChange: (patch: Partial<ModelParams>) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hideTooLarge, setHideTooLarge] = useState(true);

  const filtered = useMemo(() => {
    let list = models;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q) ||
          m.family.toLowerCase().includes(q),
      );
    }
    if (hideTooLarge) {
      list = list.filter((m) => {
        const fit = fitFor(m.vramRequiredMB, system?.deviceMemoryGB ?? null);
        return fit.fits || fit.tight || m.cached || m.id === loadedModelId;
      });
    }
    return list;
  }, [models, search, hideTooLarge, system, loadedModelId]);

  const recommendedId = useMemo(() => {
    for (const m of models) {
      const fit = fitFor(m.vramRequiredMB, system?.deviceMemoryGB ?? null);
      if (fit.fits) return m.id;
    }
    return models[0]?.id ?? null;
  }, [models, system]);

  const families = useMemo(() => groupByFamily(filtered), [filtered]);

  return (
    <Modal open={open} onClose={onClose} title="Models">
      <div className="px-4 py-3 border-b border-line space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models…"
          className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-1.5 text-[13px] text-text placeholder:text-mute font-mono"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 font-mono text-[11px] text-mute cursor-pointer">
            <input
              type="checkbox"
              checked={hideTooLarge}
              onChange={(e) => setHideTooLarge(e.target.checked)}
              className="accent-accent"
            />
            hide too-large models
          </label>
          <span className="font-mono text-[11px] text-mute">
            {filtered.length} / {models.length}
          </span>
        </div>
        <StatusPanel
          status={engineStatus}
          progress={loadProgress}
          loadedModelId={loadedModelId}
        />
      </div>

      <div className="p-4 space-y-4">
        {families.map((family) => (
          <div key={family.name}>
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
              {family.name}
            </div>
            <div className="space-y-1">
              {family.models.map((model) => {
                const fit = fitFor(
                  model.vramRequiredMB,
                  system?.deviceMemoryGB ?? null,
                );
                return (
                  <ModelCard
                    key={model.id}
                    model={model}
                    isSelected={selectedId === model.id}
                    isLoaded={loadedModelId === model.id}
                    isRecommended={recommendedId === model.id}
                    fitStatus={fit}
                    onSelect={setSelectedId}
                    onLoad={onLoad}
                    onUnload={onUnload}
                    onEvict={onEvict}
                    engineStatus={engineStatus}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {families.length === 0 && (
          <div className="font-mono text-[12px] text-mute text-center py-8">
            No models match your search.
          </div>
        )}
      </div>

      <ModelParamsPanel params={params} onChange={onParamsChange} />
    </Modal>
  );
}
