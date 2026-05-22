import type { EngineStatus, LoadProgress, ModelInfo } from '../../providers/types';
import { Dot } from '../ui/Dot';
import { Icon } from '../ui/Icon';
import { BrandLogo } from '../ui/BrandLogo';
import { shortenModelId } from '../../lib/format';
import { brandForModelId } from '../../lib/model-meta';

export function ModelSlot({
  model,
  models,
  state,
  progress,
  onClick,
}: {
  model: string | null;
  models: ModelInfo[];
  state: EngineStatus;
  progress: LoadProgress;
  onClick: () => void;
}) {
  const isReady = state === 'ready' && !!model;
  const isLoading = state === 'loading';
  const brand = model ? brandForModelId(model, models) : null;
  const dot = isReady ? 'ok' : isLoading ? 'accent' : 'mute';

  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 pl-1.5 pr-2.5 py-1 border transition-colors min-w-0 ${
        isReady
          ? 'border-line bg-surface hover:border-line-hi'
          : 'border-line bg-surface/60 hover:border-accent/50'
      }`}
    >
      <span className="w-5 h-5 shrink-0 flex items-center justify-center">
        {brand ? <BrandLogo brand={brand} size={18} /> : <Icon name="chat" size={14} />}
      </span>
      <div className="flex flex-col items-start min-w-0 leading-tight">
        <span className="font-mono text-[9px] uppercase tracking-widest text-mute">chat</span>
        <div className="flex items-center gap-1.5 max-w-[230px]">
          <Dot tone={dot} />
          <span
            className={`font-mono text-[11px] truncate ${isReady ? 'text-text' : 'text-mute'}`}
          >
            {isLoading
              ? progress.text || 'loading…'
              : model
                ? shortenModelId(model)
                : 'no model loaded'}
          </span>
        </div>
      </div>
    </button>
  );
}
