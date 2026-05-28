/**
 * D10b (#4) — in-chat "Compacting context" divider, shown while an
 * auto-compaction LLM pass runs at the start of a send (before the
 * assistant stream begins). Mirrors the Codex-style centered label
 * between two rules. The pulse signals "working" without a spinner
 * that would clash with the brutalist line aesthetic.
 */
export function CompactingIndicator() {
  return (
    <div className="flex items-center gap-3 my-3 select-none animate-pulse">
      <div className="flex-1 h-px bg-line" />
      <span className="font-mono text-[11px] text-mute uppercase tracking-widest">
        compacting context…
      </span>
      <div className="flex-1 h-px bg-line" />
    </div>
  );
}
