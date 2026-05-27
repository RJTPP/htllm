import type { EmbedProgress } from '../../lib/embed-pipeline';

/**
 * Slim progress bar shown while an embedding pass is running. Hidden when
 * `progress` is null — the parent controls visibility.
 */
export function EmbeddingProgress({ progress }: { progress: EmbedProgress | null }) {
  if (!progress) return null;

  // D8 Part B — when contextualization is happening, the contextualized
  // counter ticks ahead of `embedded` (LLM blurb is generated before the
  // chunk is embedded). Show it so the user sees progress during the
  // long LLM passes instead of staring at a still bar.
  const contextualized = progress.contextualized ?? 0;

  // Multi-file passes (upload, embed-all) report per-file granularity.
  // We prefer it for the bar AND the right-aligned counter — most users
  // want to see "where am I in this file" more than "where am I overall."
  const hasFiles =
    progress.fileTotal !== undefined &&
    progress.fileIndex !== undefined &&
    progress.fileChunks !== undefined &&
    progress.fileEmbedded !== undefined;

  // Bar progress: when we know files, blend file index + within-file
  // fraction so the bar moves smoothly across the whole batch instead
  // of jumping in steps. Otherwise fall back to chunk progress.
  let pct = 0;
  if (hasFiles) {
    const inFile =
      (progress.fileChunks ?? 0) > 0
        ? (progress.fileEmbedded ?? 0) / (progress.fileChunks ?? 1)
        : 0;
    pct = (((progress.fileIndex ?? 0) + inFile) / (progress.fileTotal ?? 1)) * 100;
  } else {
    pct = progress.total > 0 ? (progress.embedded / progress.total) * 100 : 0;
  }

  return (
    <div className="border border-line bg-surface/40 p-3 space-y-1.5">
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-text/80">
          {contextualized > progress.embedded
            ? 'Contextualizing + embedding…'
            : 'Embedding…'}
        </span>
        <span className="text-mute">
          {hasFiles ? (
            <>
              file {(progress.fileIndex ?? 0) + 1}/{progress.fileTotal} · chunk{' '}
              {progress.fileEmbedded}/{progress.fileChunks}
            </>
          ) : (
            <>
              {progress.embedded} / {progress.total}
            </>
          )}
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
