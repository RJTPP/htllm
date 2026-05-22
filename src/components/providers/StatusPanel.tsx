import type { EngineStatus, LoadProgress } from '../../providers/types';
import { shortenModelId } from '../../lib/format';

export function StatusPanel({
  status,
  progress,
  loadedModelId,
}: {
  status: EngineStatus;
  progress: LoadProgress;
  loadedModelId: string | null;
}) {
  if (status === 'idle') return null;

  const isLoading = status === 'loading';
  const isError = status === 'error';
  const pct = Math.round((progress.progress ?? 0) * 100);

  return (
    <div
      className={`border-l-2 ${isError ? 'border-err' : isLoading ? 'border-accent' : 'border-ok'} bg-surface px-3 py-2.5`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-mute">
          {isLoading ? 'loading' : isError ? 'error' : 'ready'}
        </div>
        {isLoading && (
          <div className="font-mono text-[11px] text-accent">{pct}%</div>
        )}
      </div>
      <div
        className={`font-mono text-[11px] ${isError ? 'text-err' : 'text-text'} break-words leading-snug`}
      >
        {progress.text || shortenModelId(loadedModelId ?? '')}
      </div>
      {isLoading && (
        <div className="mt-2 h-1 bg-bg border border-line overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
