import type { EmbedProgress } from '../../lib/embed-pipeline';

/**
 * Slim progress bar shown while an embedding pass is running. Hidden when
 * `progress` is null — the parent controls visibility.
 */
export function EmbeddingProgress({ progress }: { progress: EmbedProgress | null }) {
  if (!progress) return null;
  const pct = progress.total > 0 ? (progress.embedded / progress.total) * 100 : 0;
  // D8 Part B — when contextualization is happening, the contextualized
  // counter ticks ahead of `embedded` (LLM blurb is generated before the
  // chunk is embedded). Show it so the user sees progress during the
  // long LLM passes instead of staring at a still bar.
  const contextualized = progress.contextualized ?? 0;
  return (
    <div className="border border-line bg-surface/40 p-3 space-y-1.5">
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-text/80">
          {contextualized > progress.embedded
            ? 'Contextualizing + embedding…'
            : 'Embedding…'}
        </span>
        <span className="text-mute">
          {progress.embedded} / {progress.total}
          {contextualized > 0 && (
            <span className="text-accent/70"> · ctx {contextualized}</span>
          )}
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
