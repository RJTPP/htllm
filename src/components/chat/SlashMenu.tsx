import { useEffect, useRef } from 'react';
import type { PromptTemplate } from '../../providers/types';

/**
 * A slash command surfaced in the composer's `/` menu. Unlike a prompt
 * template (which inserts text), running a command performs an action
 * and closes the menu — e.g. /new, /compact, /settings.
 */
export interface SlashCommand {
  id: string;
  /** Shown as `/label` in the menu and matched against the query. */
  label: string;
  description: string;
  run: () => void;
}

/**
 * Unified `/` menu — commands first (actions), then prompt templates
 * (text insertion). Presentational: the composer owns the filtered
 * lists and the flat keyboard index. The flat index runs commands[0..n)
 * then templates[0..m), so arrow keys traverse both sections smoothly.
 */
export function SlashMenu({
  commands,
  templates,
  selectedIndex,
  onPickCommand,
  onPickTemplate,
  onHover,
}: {
  commands: SlashCommand[];
  templates: PromptTemplate[];
  selectedIndex: number;
  onPickCommand: (cmd: SlashCommand) => void;
  onPickTemplate: (template: PromptTemplate) => void;
  /** Hover sets the flat selection index (commands then templates). */
  onHover: (flatIndex: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the keyboard-selected row in view as arrows move past the
  // visible window (the menu is height-capped + scrollable).
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-slash-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (commands.length === 0 && templates.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1.5 border border-line bg-surface max-h-64 overflow-y-auto z-20"
    >
      {commands.length > 0 && (
        <>
          <div className="px-3 py-1.5 border-b border-line font-mono text-[10px] text-mute uppercase tracking-widest">
            commands
          </div>
          {commands.map((c, i) => (
            <button
              key={c.id}
              data-slash-index={i}
              onClick={() => onPickCommand(c)}
              onMouseMove={() => onHover(i)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between ${
                i === selectedIndex ? 'bg-accent/10' : 'hover:bg-surface2'
              }`}
            >
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-text">/{c.label}</div>
                <div className="font-mono text-[10px] text-mute truncate">
                  {c.description}
                </div>
              </div>
              <span className="font-mono text-[9px] text-accent/60 shrink-0 ml-2">
                action
              </span>
            </button>
          ))}
        </>
      )}
      {templates.length > 0 && (
        <>
          <div className="px-3 py-1.5 border-b border-line font-mono text-[10px] text-mute uppercase tracking-widest">
            prompt templates
          </div>
          {templates.map((t, i) => {
            const flatIndex = commands.length + i;
            return (
              <button
                key={t.id}
                data-slash-index={flatIndex}
                onClick={() => onPickTemplate(t)}
                onMouseMove={() => onHover(flatIndex)}
                className={`w-full text-left px-3 py-2 flex items-center justify-between ${
                  flatIndex === selectedIndex ? 'bg-accent/10' : 'hover:bg-surface2'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-mono text-[12px] text-text">/{t.title}</div>
                  <div className="font-mono text-[10px] text-mute truncate">
                    {t.description?.trim() || t.content.replace(/\n/g, ' ').trim()}
                  </div>
                </div>
                {t.isBuiltIn && (
                  <span className="font-mono text-[9px] text-mute shrink-0 ml-2">
                    built-in
                  </span>
                )}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
