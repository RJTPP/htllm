import { shortenModelId } from '../../lib/format';

export function EmptyState({
  modelReady,
  loadedModelId,
}: {
  modelReady: boolean;
  loadedModelId: string | null;
}) {
  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className="border border-line bg-surface p-6">
        <div className="font-mono text-[10px] text-accent uppercase tracking-widest mb-2">
          README
        </div>
        <h2 className="text-lg font-medium mb-3">
          Local-only chat. No server.
        </h2>
        <p className="text-sm text-mute leading-relaxed">
          Models run entirely in your browser via WebGPU. Weights are downloaded
          once and cached, then never leave your device. The first load can take
          a while (large download); subsequent loads are seconds.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
          <div className="border border-line p-3">
            <div className="text-accent mb-1">1 · pick</div>
            <div className="text-mute">
              Choose a model from the sidebar. Smallest first.
            </div>
          </div>
          <div className="border border-line p-3">
            <div className="text-accent mb-1">2 · load</div>
            <div className="text-mute">
              First time downloads weights to browser cache.
            </div>
          </div>
          <div className="border border-line p-3">
            <div className="text-accent mb-1">3 · chat</div>
            <div className="text-mute">
              Generation happens on your GPU.
            </div>
          </div>
        </div>
        {modelReady && loadedModelId && (
          <div className="mt-4 font-mono text-[11px] text-ok">
            ✓ {shortenModelId(loadedModelId)} is loaded — type below to begin.
          </div>
        )}
      </div>
    </div>
  );
}
