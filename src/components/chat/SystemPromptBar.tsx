import { useState, useEffect } from 'react';

export function SystemPromptBar({
  value,
  defaultPrompt,
  onChange,
}: {
  value: string;
  defaultPrompt: string;
  onChange: (value: string) => void;
}) {
  const isDefault = value === defaultPrompt;
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(!isDefault);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!isDefault) setExpanded(true);
  }, [isDefault]);

  if (!expanded && !editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border border-line bg-surface/40 font-mono text-[10px] text-mute whitespace-nowrap">
        <span className="text-accent uppercase tracking-widest shrink-0">system</span>
        <span className="text-mute shrink-0">·</span>
        <span className="text-text/70 flex-1 min-w-0 truncate">default</span>
        <button
          onClick={() => {
            setEditing(true);
            setExpanded(true);
          }}
          className="hover:text-text shrink-0"
        >
          edit
        </button>
        <button onClick={() => setExpanded(true)} className="hover:text-text shrink-0">
          show ↓
        </button>
      </div>
    );
  }

  return (
    <div className="border border-line bg-surface/60">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line">
        <span className="font-mono text-[10px] text-accent uppercase tracking-widest">
          system prompt
        </span>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => {
                  onChange(draft);
                  setEditing(false);
                }}
                className="font-mono text-[10px] text-accent hover:underline"
              >
                save
              </button>
              <button
                onClick={() => {
                  setDraft(value);
                  setEditing(false);
                }}
                className="font-mono text-[10px] text-mute hover:text-text"
              >
                cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="font-mono text-[10px] text-mute hover:text-text"
              >
                edit
              </button>
              {isDefault && (
                <button
                  onClick={() => setExpanded(false)}
                  className="font-mono text-[10px] text-mute hover:text-text"
                >
                  hide ↑
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          className="w-full bg-transparent px-3 py-2 text-[12.5px] text-text resize-none focus:outline-none"
        />
      ) : (
        <div className="px-3 py-2 text-[12.5px] text-mute leading-relaxed">
          {value || 'No system prompt set.'}
        </div>
      )}
    </div>
  );
}
