import { useState, useEffect, useRef } from 'react';
import { Ellipsis, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';

/**
 * Floating per-thread menu (the "…" kebab, top-right of the chat pane).
 * Replaces the always-visible SystemPromptBar that used to sit above the
 * messages — the prompt is rarely edited, so it doesn't earn permanent
 * real estate. The kebab is also the natural home for future per-thread
 * actions (rename, params, export…).
 *
 * Self-contained: owns the dropdown open state and the system-prompt
 * editor popup, so ChatPage just hands it the value + onChange.
 */
export function ThreadMenu({
  value,
  defaultPrompt,
  onChange,
}: {
  value: string;
  defaultPrompt: string;
  onChange: (value: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isCustom = value.trim() !== defaultPrompt.trim() && value.trim().length > 0;

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        title="Thread options"
        className={`flex items-center justify-center w-7 h-7 border border-line bg-surface/80 backdrop-blur-sm transition-colors ${
          menuOpen ? 'text-accent border-accent/50' : 'text-mute hover:text-text'
        }`}
      >
        <Ellipsis size={14} />
        {isCustom && !menuOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-accent" />
        )}
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 min-w-44 border border-line bg-surface shadow-lg z-30">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setPromptOpen(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-[12px] text-text hover:bg-surface2"
          >
            <FileText size={12} className="text-mute shrink-0" />
            <span className="flex-1">System prompt</span>
            <span className="font-mono text-[9px] text-mute/70 uppercase tracking-wider">
              {isCustom ? 'custom' : 'default'}
            </span>
          </button>
        </div>
      )}

      <SystemPromptModal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        value={value}
        defaultPrompt={defaultPrompt}
        onChange={onChange}
      />
    </div>
  );
}

function SystemPromptModal({
  open,
  onClose,
  value,
  defaultPrompt,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  defaultPrompt: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Re-seed the draft each time the popup opens so it reflects the
  // current value (and discards an abandoned edit from last time).
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const save = () => {
    onChange(draft);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="System prompt"
      subtitle="Applies to this thread only."
      width="max-w-lg"
    >
      <div className="p-4 space-y-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          autoFocus
          placeholder="Set a persona or instructions for this thread…"
          className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-2 text-[13px] text-text resize-none"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setDraft(defaultPrompt)}
            disabled={draft.trim() === defaultPrompt.trim()}
            className="font-mono text-[11px] text-mute hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
          >
            reset to default
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-[11px] px-3 py-1.5 border border-line text-mute hover:text-text"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10"
            >
              save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
