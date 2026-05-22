import { useState, useEffect, useCallback } from 'react';
import type { PromptTemplate } from '../../providers/types';

export function PromptHints({
  query,
  templates,
  onSelect,
  onDismiss,
}: {
  query: string;
  templates: PromptTemplate[];
  onSelect: (content: string) => void;
  onDismiss: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = templates.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        onSelect(filtered[selectedIndex].content);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    },
    [filtered, selectedIndex, onSelect, onDismiss],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 border border-line bg-surface max-h-48 overflow-y-auto z-20">
      {filtered.map((t, i) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.content)}
          className={`w-full text-left px-3 py-2 font-mono text-[12px] flex items-center justify-between ${
            i === selectedIndex
              ? 'bg-accent/10 text-text'
              : 'text-mute hover:bg-surface2 hover:text-text'
          }`}
        >
          <span>{t.title}</span>
          {t.isBuiltIn && (
            <span className="text-[10px] text-mute">built-in</span>
          )}
        </button>
      ))}
    </div>
  );
}
