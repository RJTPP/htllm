import { useState } from 'react';
import type { SystemInfo, EngineStatus } from '../../providers/types';
import type { GroupedModel } from '../../lib/model-meta';
import { brandForFamily } from '../../lib/model-meta';
import { fitFor } from '../../lib/fit';
import { fmtMB } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Dot } from '../ui/Dot';
import { Chevron } from '../ui/Chevron';
import { BrandLogo } from '../ui/BrandLogo';

export function ModelGridCard({
  model,
  system,
  loadedId,
  recommended,
  engineState,
  onLoad,
  onUnload,
  onEvict,
}: {
  model: GroupedModel;
  system: SystemInfo | null;
  loadedId: string | null;
  recommended: boolean;
  engineState: EngineStatus;
  onLoad: (id: string) => void;
  onUnload: () => void;
  onEvict: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mem = system?.deviceMemoryGB ?? null;
  const anyLoaded = model.variants.some((v) => v.id === loadedId);
  const anyCached = model.variants.some((v) => v.cached);
  const minVram = Math.min(...model.variants.map((v) => v.vramRequiredMB));
  const fit = fitFor(minVram, mem);

  return (
    <div
      className={`rounded-xl border overflow-hidden self-start transition-colors ${
        anyLoaded ? 'border-accent/60 bg-accent/[0.07]' : 'border-line bg-surface hover:border-line-hi'
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <BrandLogo brand={brandForFamily(model.family)} size={22} />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] text-text truncate leading-tight">{model.name}</div>
          <div className="font-mono text-[10px] mt-0.5 flex items-center gap-1 whitespace-nowrap overflow-hidden">
            <span className="text-mute">
              {fmtMB(minVram)}
              {model.variants.length > 1 ? ` · ${model.variants.length} var` : ''}
            </span>
            {model.vision && <span className="text-info">· vision</span>}
            {recommended && !anyLoaded && <span className="text-accent">· recommended</span>}
            {!fit.fits && !fit.tight && <span className="text-err">· too large</span>}
            {fit.tight && <span className="text-warn">· tight</span>}
          </div>
        </div>
        {anyLoaded && <Badge tone="accent">loaded</Badge>}
        {!anyLoaded && anyCached && <Dot tone="ok" />}
        <span className="text-mute">
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div className="border-t border-line">
          {model.variants.map((v) => {
            const vf = fitFor(v.vramRequiredMB, mem);
            const loaded = v.id === loadedId;
            return (
              <div
                key={v.id}
                className="flex items-center gap-1.5 px-3 py-2 border-t border-line/50 first:border-t-0 bg-bg/30"
              >
                <span
                  className={`font-mono text-[10px] uppercase w-12 shrink-0 ${loaded ? 'text-accent' : 'text-mute'}`}
                >
                  {v.quantization}
                </span>
                <span
                  className={`font-mono text-[10px] w-16 shrink-0 ${
                    !vf.fits && !vf.tight ? 'text-err' : vf.tight ? 'text-warn' : 'text-mute'
                  }`}
                >
                  {fmtMB(v.vramRequiredMB)}
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-1 shrink-0">
                  {loaded ? (
                    <button
                      onClick={onUnload}
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-line text-mute hover:text-text"
                    >
                      unload
                    </button>
                  ) : (
                    <button
                      onClick={() => onLoad(v.id)}
                      disabled={engineState === 'loading'}
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-40"
                    >
                      {v.cached ? 'load' : 'download'}
                    </button>
                  )}
                  {v.cached && (
                    <button
                      onClick={() => onEvict(v.id)}
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-line text-mute hover:text-err hover:border-err/40"
                    >
                      evict
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
