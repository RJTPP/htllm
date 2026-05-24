import type { EmbedProgress } from '../../lib/embed-pipeline';

/**
 * Slim progress bar shown while an embedding pass is running. Hidden when
 * `progress` is null — the parent controls visibility.
 */
export function EmbeddingProgress({ progress }: { progress: EmbedProgress | null }) {
  if (!progress) return null;
  const pct = progress.total > 0 ? (progress.embedded / progress.total) * 100 : 0;
  return (
    <div className="border border-line bg-surface/40 p-3 space-y-1.5">
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-text/80">Embedding…</span>
        <span className="text-mute">
          {progress.embedded} / {progress.total}
        </span>
      </div>
      <div className="w-full h-1.5 bg-bg overflow-hidden">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
