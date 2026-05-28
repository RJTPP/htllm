import { Scissors } from 'lucide-react';

/**
 * D10b (#) — inline marker for the sliding-window horizon. Messages
 * above this line are still in your history (and visible) but were NOT
 * sent to the model on the last request because they didn't fit the
 * context budget. Unlike the summary divider this is a live boundary —
 * it moves as the conversation grows or the window changes — and there
 * is no recovery of the dropped content (that's what auto-compaction is
 * for).
 *
 * Replaces the composer's "−N trimmed" chip: showing the cut inline,
 * at the actual position in the transcript, is clearer than a count.
 */
export function TrimDivider({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3 my-3 select-none" title="Older messages above this line weren't sent to the model — over the context budget. Switch Compression to auto to summarize them instead of dropping.">
      <div className="flex-1 h-px bg-warn/30" />
      <span className="flex items-center gap-1 font-mono text-[10px] text-warn/70 uppercase tracking-widest">
        <Scissors size={10} />
        {count} message{count === 1 ? '' : 's'} above not sent
      </span>
      <div className="flex-1 h-px bg-warn/30" />
    </div>
  );
}
