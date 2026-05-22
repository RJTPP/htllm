import type { PromptTemplate } from '../../providers/types';

/**
 * Dropdown of /-triggered prompt templates. Presentational — the composer
 * owns the match list and keyboard selection so Enter/arrows work.
 */
export function PromptHints({
  matches,
  selectedIndex,
  onPick,
  onHover,
}: {
  matches: PromptTemplate[];
  selectedIndex: number;
  onPick: (template: PromptTemplate) => void;
  onHover: (index: number) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1.5 border border-line bg-surface max-h-52 overflow-y-auto z-20">
      <div className="px-3 py-1.5 border-b border-line font-mono text-[10px] text-mute uppercase tracking-widest">
        prompt templates
      </div>
      {matches.map((t, i) => (
        <button
          key={t.id}
          onClick={() => onPick(t)}
          onMouseMove={() => onHover(i)}
          className={`w-full text-left px-3 py-2 flex items-center justify-between ${
            i === selectedIndex ? 'bg-accent/10' : 'hover:bg-surface2'
          }`}
        >
          <div className="min-w-0">
            <div className="font-mono text-[12px] text-text">/{t.title}</div>
            <div className="font-mono text-[10px] text-mute truncate">
              {t.content.replace(/\n/g, ' ').trim()}
            </div>
          </div>
          {t.isBuiltIn && (
            <span className="font-mono text-[9px] text-mute shrink-0 ml-2">built-in</span>
          )}
        </button>
      ))}
    </div>
  );
}
