import type { EngineStatus, LoadProgress } from '../../providers/types';

export function StatusPanel({
  engineState,
  progress,
}: {
  engineState: EngineStatus;
  progress: LoadProgress;
}) {
  if (engineState === 'idle') return null;

  const isLoading = engineState === 'loading';
  const isError = engineState === 'error';
  const pct = Math.round((progress.progress ?? 0) * 100);

  return (
    <div
      className={`border-l-2 ${isError ? 'border-err' : isLoading ? 'border-accent' : 'border-ok'} bg-surface px-3 py-2.5`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-mute">
          {isLoading ? 'loading' : isError ? 'error' : 'ready'}
        </div>
        {isLoading && <div className="font-mono text-[11px] text-accent">{pct}%</div>}
      </div>
      <div
        className={`font-mono text-[11px] ${isError ? 'text-err' : 'text-text'} leading-snug break-words`}
      >
        {progress.text}
      </div>
      {isLoading && (
        <div className="mt-2 h-1 bg-bg border border-line overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
