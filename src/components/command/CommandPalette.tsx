import { useState, useEffect, useRef, useMemo } from 'react';
import { Search } from 'lucide-react';

/** A single command palette entry. */
export interface Command {
  id: string;
  /** Display label, shown in the list and matched against the query. */
  label: string;
  /** Group heading — entries are rendered grouped in insertion order. */
  group: string;
  /** Optional keyboard-shortcut hint shown right-aligned. */
  hint?: string;
  /** Invoked when the command is chosen. The palette closes first. */
  run: () => void;
}

/**
 * Cmd/Ctrl+K command palette. Fuzzy-free substring search, arrow-key
 * navigation, Enter to run, Esc to close. Commands are supplied by the
 * caller (App) so the palette stays free of app wiring.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset query/selection and focus the input each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Substring match on label + group. Preserves caller insertion order.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Keep the selection index within bounds as the filtered list shrinks.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll the active row into view on selection change.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // Arrow navigation / Enter / Escape — window-level so it works while the
  // search input holds focus.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) {
          onClose();
          cmd.run();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selected, onClose]);

  if (!open) return null;

  const runCommand = (cmd: Command) => {
    onClose();
    cmd.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl mx-4 bg-surface border border-line flex flex-col max-h-[60vh]">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
          <Search size={14} className="text-mute shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search threads…"
            className="flex-1 bg-transparent focus:outline-none text-[13px] text-text placeholder:text-mute"
          />
          <kbd className="font-mono text-[10px] text-mute border border-line px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center font-mono text-[11px] text-mute">
              no matching commands
            </div>
          ) : (
            filtered.map((cmd, i) => {
              const showHeader = i === 0 || filtered[i - 1]!.group !== cmd.group;
              return (
                <div key={cmd.id}>
                  {showHeader && (
                    <div className="px-3 pt-2 pb-1 font-mono text-[9px] uppercase tracking-widest text-mute/60">
                      {cmd.group}
                    </div>
                  )}
                  <button
                    data-index={i}
                    onClick={() => runCommand(cmd)}
                    onMouseMove={() => setSelected(i)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] ${
                      selected === i
                        ? 'bg-accent/10 text-accent'
                        : 'text-text hover:text-text'
                    }`}
                  >
                    <span className="flex-1 truncate">{cmd.label}</span>
                    {cmd.hint && (
                      <kbd
                        className={`font-mono text-[10px] border px-1.5 py-0.5 ${
                          selected === i
                            ? 'border-accent/40 text-accent'
                            : 'border-line text-mute'
                        }`}
                      >
                        {cmd.hint}
                      </kbd>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-line font-mono text-[10px] text-mute/70">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
