import type { PromptTemplate } from '../../providers/types';

export function PromptHints({
  query,
  templates,
  onPick,
}: {
  query: string;
  templates: PromptTemplate[];
  onPick: (template: PromptTemplate) => void;
}) {
  const matches = templates.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()),
  );
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
          className={`w-full text-left px-3 py-2 flex items-center justify-between ${
            i === 0 ? 'bg-accent/5' : 'hover:bg-surface2'
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
