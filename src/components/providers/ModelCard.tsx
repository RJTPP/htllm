import type { ModelInfo, EngineStatus, FitResult } from '../../providers/types';
import { Badge } from '../ui/Badge';
import { fmtMB, shortenModelId } from '../../lib/format';

export function ModelCard({
  model,
  isSelected,
  isLoaded,
  isRecommended,
  fitStatus,
  onSelect,
  onLoad,
  onUnload,
  onEvict,
  engineStatus,
}: {
  model: ModelInfo;
  isSelected: boolean;
  isLoaded: boolean;
  isRecommended: boolean;
  fitStatus: FitResult;
  onSelect: (id: string) => void;
  onLoad: (id: string) => void;
  onUnload: () => void;
  onEvict: (id: string) => void;
  engineStatus: EngineStatus;
}) {
  const fitTone = isLoaded
    ? 'accent'
    : fitStatus.fits
      ? 'ok'
      : fitStatus.tight
        ? 'warn'
        : 'err';

  const baseCls = `relative border w-full text-left transition-colors ${
    isSelected
      ? 'border-accent/70 bg-accent/5'
      : 'border-line bg-surface hover:bg-surface2 hover:border-line-hi'
  }`;

  return (
    <div className={baseCls}>
      <button
        onClick={() => onSelect(model.id)}
        className="block w-full text-left px-3 py-2.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-mono text-[13px] text-text truncate">
            {shortenModelId(model.id)}
          </div>
          <div className="font-mono text-[11px] text-mute shrink-0">
            {fmtMB(model.vramRequiredMB)}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] text-mute uppercase tracking-wider">
            {model.quantization}
          </span>
          {isRecommended && !isLoaded && <Badge tone="accent">recommended</Badge>}
          {isLoaded && (
            <Badge tone="accent">
              <span className="animate-pulse-dot inline-block w-1.5 h-1.5 bg-accent rounded-full" />
              loaded
            </Badge>
          )}
          {model.cached && !isLoaded && <Badge tone="ok">cached</Badge>}
          {!fitStatus.fits && !fitStatus.tight && !isLoaded && (
            <Badge tone={fitTone}>too large</Badge>
          )}
          {fitStatus.tight && !isLoaded && <Badge tone="warn">tight fit</Badge>}
        </div>
      </button>

      {isSelected && (
        <div className="border-t border-line px-3 py-2 flex items-center gap-2 bg-bg/40">
          {!isLoaded ? (
            <button
              onClick={() => onLoad(model.id)}
              disabled={engineStatus === 'loading'}
              className="font-mono text-[11px] px-2.5 py-1 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {engineStatus === 'loading'
                ? 'loading…'
                : model.cached
                  ? 'load (cached)'
                  : 'download & load'}
            </button>
          ) : (
            <button
              onClick={onUnload}
              className="font-mono text-[11px] px-2.5 py-1 border border-line text-mute hover:bg-surface2 hover:text-text"
            >
              unload
            </button>
          )}
          {model.cached && (
            <button
              onClick={() => onEvict(model.id)}
              className="font-mono text-[11px] px-2.5 py-1 border border-line text-mute hover:bg-err/10 hover:text-err hover:border-err/40"
              title="Delete from browser cache"
            >
              evict
            </button>
          )}
        </div>
      )}
    </div>
  );
}
