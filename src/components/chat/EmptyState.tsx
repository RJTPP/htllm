import { shortenModelId } from '../../lib/format';

export function EmptyState({
  onOpenPicker,
  modelReady,
  model,
}: {
  onOpenPicker: () => void;
  modelReady: boolean;
  model: string | null;
}) {
  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <div className="border border-line bg-surface">
        <div className="px-6 py-5 border-b border-line">
          <div className="font-mono text-[10px] text-accent uppercase tracking-widest mb-2">
            readme
          </div>
          <h2 className="font-mono text-lg font-medium tracking-tight">
            Local-only chat. No server.
          </h2>
          <p className="text-sm text-mute leading-relaxed mt-2">
            Models run entirely in your browser via WebGPU. Weights download once
            and are cached — then never leave your device.
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line font-mono text-[11px]">
          {[
            ['1 · pick', 'Open the model picker and choose by size.'],
            ['2 · load', 'First load downloads weights to cache.'],
            ['3 · chat', 'Generation happens on your GPU.'],
          ].map(([h, d]) => (
            <div key={h} className="px-4 py-3">
              <div className="text-accent mb-1">{h}</div>
              <div className="text-mute leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-line">
          {modelReady && model ? (
            <div className="font-mono text-[11px] text-ok">
              ✓ {shortenModelId(model)} loaded — type below to begin.
            </div>
          ) : (
            <button
              onClick={onOpenPicker}
              className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10"
            >
              choose a model →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
