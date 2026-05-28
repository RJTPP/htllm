import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react';
import type { ConversationSummary } from '../../providers/types';
import { fmtRelativeTime } from '../../lib/format';

/**
 * D10b — inline divider that replaces summarized turns in the message
 * stream. Shows what was compacted, by how much, and lets the user
 * expand the saved summary text. Click-to-expand pattern keeps the
 * chat surface clean by default; power users can verify what the model
 * actually saw.
 */
export function SummaryDivider({
  summary,
  onClear,
}: {
  summary: ConversationSummary;
  /** Optional clear handler — the trash icon only renders when wired. */
  onClear?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const replacedCount = summary.replacedMessageIds.length;

  return (
    <div className="border border-line/60 bg-surface/30 my-2">
      {/* Header row: the expand toggle and the clear action are SIBLINGS,
          not nested — a button inside a button is invalid DOM. */}
      <div className="flex items-center hover:bg-surface/60 transition-colors">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left"
        >
          {expanded ? (
            <ChevronDown size={12} className="text-mute shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-mute shrink-0" />
          )}
          <FileText size={11} className="text-accent/70 shrink-0" />
          <span className="font-mono text-[10.5px] text-text/80 uppercase tracking-widest shrink-0">
            summarized {replacedCount} turn{replacedCount === 1 ? '' : 's'}
          </span>
          <span className="font-mono text-[10px] text-mute shrink-0">
            {summary.replacedTokens}
            {' → '}
            {summary.summaryTokens} tokens
          </span>
          <span className="font-mono text-[10px] text-mute/70 truncate">
            · {summary.source} · {fmtRelativeTime(summary.createdAt)}
          </span>
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            title="Clear this summary — older messages will be subject to sliding window on the next send"
            className="p-2 text-mute/60 hover:text-err shrink-0"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-line/40">
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
