import { useState } from 'react';
import type { ConversationSummary } from '../../providers/types';

/**
 * D10b — persistent marker for the compaction boundary. Matches the
 * CompactingIndicator's centered-line aesthetic so the transition reads
 * as one continuous thing: "compacting context…" while the call runs,
 * then this past-tense "compacted context" line once it lands.
 *
 * Click the line to expand the saved summary text (so you can verify
 * what the model actually sees). No delete — the summary is managed
 * automatically (re-compaction replaces it), and removing it by hand
 * would just desync the prompt from the visible transcript.
 */
export function SummaryDivider({ summary }: { summary: ConversationSummary }) {
  const [expanded, setExpanded] = useState(false);
  const replacedCount = summary.replacedMessageIds.length;

  return (
    <div className="my-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 select-none group"
        title="Click to view the context summary"
      >
        <div className="flex-1 h-px bg-line group-hover:bg-line/80" />
        <span className="font-mono text-[10px] text-mute group-hover:text-text/70 uppercase tracking-widest transition-colors">
          compacted context · {replacedCount} turn
          {replacedCount === 1 ? '' : 's'} · {summary.replacedTokens}→
          {summary.summaryTokens} tok
        </span>
        <div className="flex-1 h-px bg-line group-hover:bg-line/80" />
      </button>
      {expanded && (
        <div className="mt-2 border border-line/60 bg-surface/30 px-3 py-2.5">
          <div className="font-sans text-[12.5px] text-text/85 whitespace-pre-wrap break-words leading-relaxed">
            {summary.text}
          </div>
          {summary.generation > 1 && (
            <div className="font-mono text-[9px] text-mute/70 mt-2 uppercase tracking-wider">
              generation {summary.generation} — replaces an earlier summary
            </div>
          )}
        </div>
      )}
    </div>
  );
}
