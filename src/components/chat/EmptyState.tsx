import { MessagesSquare, FolderOpen } from 'lucide-react';
import { shortenModelId } from '../../lib/format';
import type { ThreadMode } from '../../providers/types';

const MODES: { id: ThreadMode; label: string; icon: typeof MessagesSquare; purpose: string }[] = [
  { id: 'chat', label: 'Chat', icon: MessagesSquare, purpose: 'Talk with any model, including in-browser ones. Optionally ground answers in a Knowledge library.' },
  { id: 'workspace', label: 'Workspace', icon: FolderOpen, purpose: 'The model reads, searches and writes files in this chat and hands you results. Needs a tool-capable HTTP model.' },
];

export function EmptyState({
  onOpenPicker,
  modelReady,
  model,
  mode,
  onChangeMode,
  workspaceUnavailable,
}: {
  onOpenPicker: () => void;
  modelReady: boolean;
  model: string | null;
  /** Present on an empty chat: the mode can still be changed (D-3, D-4). */
  mode?: ThreadMode;
  onChangeMode?: (mode: ThreadMode) => void;
  /** Why the current model cannot run Workspace, if it cannot. */
  workspaceUnavailable?: string;
}) {
  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <div className="border border-line bg-surface">
        <div className="px-6 py-5 border-b border-line">
          <div className="font-mono text-[10px] text-accent uppercase tracking-widest mb-2">
            readme
          </div>
          <h2 className="font-mono text-lg font-medium tracking-tight">
            Chat, or work with files.
          </h2>
          <p className="text-sm text-mute leading-relaxed mt-2">
            WebLLM runs in your browser. HTTP models receive your messages and
            selected document evidence at the configured endpoint, which may
            proxy requests to another machine. Conversations are stored in this browser.
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line font-mono text-[11px]">
          {[
            ['1 · mode', 'Chat for conversation; Workspace for reading and writing files.'],
            ['2 · pick', 'Choose a browser model or configure an HTTP provider.'],
            ['3 · ground', 'Attach a Knowledge library for cited answers.'],
          ].map(([h, d]) => (
            <div key={h} className="px-4 py-3">
              <div className="text-accent mb-1">{h}</div>
              <div className="text-mute leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
        {mode && onChangeMode && (
          <div className="px-6 py-4 border-t border-line">
            <div role="radiogroup" aria-label="Chat mode" className="grid grid-cols-2 gap-2">
              {MODES.map(({ id, label, icon: Icon, purpose }) => {
                const selected = mode === id;
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChangeMode(id)}
                    className={`text-left px-3 py-2.5 border transition-colors focus-visible:outline focus-visible:outline-accent ${
                      selected ? 'border-accent/60 bg-accent/10' : 'border-line hover:border-line-hi'
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 font-mono text-[12px] ${selected ? 'text-accent' : 'text-text'}`}>
                      <Icon size={13} /> {label}
                    </div>
                    <div className="text-[12px] text-mute leading-relaxed mt-1">{purpose}</div>
                  </button>
                );
              })}
            </div>
            <div className="font-mono text-[10px] text-mute mt-2">
              The mode locks when you send the first message.
            </div>
            {mode === 'workspace' && workspaceUnavailable && (
              <div role="status" className="font-mono text-[11px] text-warn mt-2">{workspaceUnavailable}</div>
            )}
          </div>
        )}
        <div className="px-6 py-4 border-t border-line">
          {modelReady && model ? (
            <div className="font-mono text-[11px] text-ok">
              ✓ {shortenModelId(model)} ready — type below to begin.
            </div>
          ) : (
            <button
              onClick={onOpenPicker}
              className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10"
            >
              choose a model →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
