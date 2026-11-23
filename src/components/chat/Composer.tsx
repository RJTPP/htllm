import { useState, useRef, useEffect, useCallback, useMemo, memo, type ReactNode } from 'react';
import type { PromptTemplate, ReasoningEffort, ReasoningCapability } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import { compressImage, compressFromDataTransfer } from '../../lib/image';
import { shortenModelId } from '../../lib/format';
import { COMPACT_TRIGGER_FRACTION } from '../../data/settings';
import { Image, ArrowRight, Brain, Loader2, Paperclip } from 'lucide-react';
import { SlashMenu, type SlashCommand } from './SlashMenu';
import { Tooltip } from '../ui/Tooltip';

const MAX_IMAGES = 3;

const ContextRing = memo(function ContextRing({
  used,
  total,
}: {
  used: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const r = 6;
  const sw = 2.5;
  const size = (r + sw) * 2;
  const center = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  // Red once usage crosses the compaction trigger — that's the point
  // where auto-compaction kicks in (or, in drop/off modes, where
  // context starts getting lost). Amber as an approaching-warning tier.
  const color =
    pct >= COMPACT_TRIGGER_FRACTION
      ? '#ef4444'
      : pct > COMPACT_TRIGGER_FRACTION - 0.15
        ? '#eab308'
        : 'rgb(var(--accent))';
  const label = `${(used / 1000).toFixed(1)}k / ${(total / 1000).toFixed(1)}k (${Math.round(pct * 100)}%)`;

  return (
    <span className="inline-flex items-center gap-1.5" title={`Context: ${label}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="#404040"
          strokeWidth={sw}
        />
        {pct > 0 && (
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}
      </svg>
      <span>{label}</span>
    </span>
  );
});

export function Composer({
  modelReady,
  model,
  visionOk,
  generating,
  templates,
  contextUsed,
  contextTotal,
  compacting = false,
  slashCommands = [],
  reasoningCapability,
  reasoningEffort,
  onReasoningChange,
  onSend,
  onStop,
  onParams,
  toolControls,
  onAttachFiles,
  attachAccept,
  notice,
}: {
  modelReady: boolean;
  model: string | null;
  visionOk: boolean;
  generating: boolean;
  templates: PromptTemplate[];
  contextUsed: number;
  contextTotal: number;
  /** D10b — true while a compaction LLM call is in flight; shows a
   *  passive "compacting…" status next to the meter. */
  compacting?: boolean;
  /** Slash commands surfaced in the `/` menu alongside prompt
   *  templates. Running one performs an action and clears the input. */
  slashCommands?: SlashCommand[];
  reasoningCapability?: ReasoningCapability;
  reasoningEffort: ReasoningEffort;
  onReasoningChange: (effort: ReasoningEffort) => void;
  onSend: (text: string, images?: ChatImage[]) => void;
  onStop: () => void;
  onParams: () => void;
  toolControls?: ReactNode;
  /** Workspace chats: add files to the chat's /uploads (D-5). */
  onAttachFiles?: (files: File[]) => void;
  attachAccept?: string;
  /** One status line above the composer (e.g. upload results). */
  notice?: ReactNode;
}) {
  const [input, setInput] = useState('');
  const attachRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ChatImage[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reasoningTooltip =
    reasoningCapability === 'toggle'
      ? 'Thinking — this model supports on/off'
      : reasoningCapability === 'effort'
        ? 'Reasoning effort — this model supports low/medium/high'
        : 'Reasoning effort — may not apply to this model';

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [input]);

  const hintQuery =
    input.startsWith('/') && input.length < 40 && !input.includes('\n')
      ? input.slice(1)
      : null;

  // Commands + templates matching the current /-query. Commands come
  // first in the flat keyboard order, then templates.
  const commandMatches = useMemo(() => {
    if (hintQuery === null) return [];
    const q = hintQuery.toLowerCase();
    return slashCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [hintQuery, slashCommands]);

  const templateMatches = useMemo(() => {
    if (hintQuery === null) return [];
    const q = hintQuery.toLowerCase();
    return templates.filter((t) => t.title.toLowerCase().includes(q));
  }, [hintQuery, templates]);

  const hintCount = commandMatches.length + templateMatches.length;
  const hintsOpen = hintCount > 0;

  const [hintIndex, setHintIndex] = useState(0);
  // Reset the selection whenever the query changes.
  useEffect(() => {
    setHintIndex(0);
  }, [hintQuery]);

  const pickTemplate = (t: PromptTemplate) => {
    setInput(t.content);
  };

  const runCommand = (c: SlashCommand) => {
    // Clear the slash query first so the menu closes, then run.
    setInput('');
    c.run();
  };

  // Resolve the flat keyboard index to either a command or a template.
  const pickAtIndex = (flatIndex: number) => {
    if (flatIndex < commandMatches.length) {
      const c = commandMatches[flatIndex];
      if (c) runCommand(c);
    } else {
      const t = templateMatches[flatIndex - commandMatches.length];
      if (t) pickTemplate(t);
    }
  };

  const send = () => {
    if (!input.trim() || generating) return;
    onSend(input.trim(), images.length > 0 ? images : undefined);
    setInput('');
    setImages([]);
  };

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) continue;
          const img = await compressImage(file);
          setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, img] : prev));
        }
      }
      e.target.value = '';
    },
    [],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (!visionOk) return;
      const img = await compressFromDataTransfer(e.clipboardData.items);
      if (img) {
        e.preventDefault();
        setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, img] : prev));
      }
    },
    [visionOk],
  );

  return (
    <div className="border-t border-line bg-bg">
      <div className="max-w-3xl mx-auto px-6 py-3">
        {images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img.url}
                  alt={`Attachment ${i + 1}`}
                  className="w-16 h-16 object-cover border border-line"
                />
                <button
                  onClick={() => setImages((arr) => arr.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-bg border border-err text-err text-[10px] leading-none flex items-center justify-center hover:bg-err hover:text-bg"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          {hintsOpen && (
            <SlashMenu
              commands={commandMatches}
              templates={templateMatches}
              selectedIndex={hintIndex}
              onPickCommand={runCommand}
              onPickTemplate={pickTemplate}
              onHover={setHintIndex}
            />
          )}
          {notice && <div role="status" className="mb-1.5 font-mono text-[11px]">{notice}</div>}
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // When the /-template hints are open, arrows navigate them
                // and Enter picks the selected one instead of sending.
                if (hintsOpen) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHintIndex((i) => Math.min(i + 1, hintCount - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHintIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    pickAtIndex(hintIndex);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setInput('');
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onPaste={handlePaste}
              rows={1}
              placeholder={
                modelReady
                  ? 'Type a message — / for commands & templates, Enter to send'
                  : "Type a message — you'll pick a model on send"
              }
              className="flex-1 resize-none bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-2 text-[14px] text-text placeholder:text-mute"
              style={{ maxHeight: '180px' }}
            />
            {onAttachFiles && (
              <>
                <button
                  onClick={() => attachRef.current?.click()}
                  title="Attach files to this workspace"
                  aria-label="Attach files to this workspace"
                  className="px-2.5 py-2 border border-line text-mute hover:text-text hover:bg-surface2"
                >
                  <Paperclip size={16} />
                </button>
                <input
                  ref={attachRef}
                  type="file"
                  accept={attachAccept}
                  multiple
                  aria-label="Workspace file upload"
                  onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) onAttachFiles(files); }}
                  className="hidden"
                />
              </>
            )}
            {modelReady && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={!visionOk || images.length >= MAX_IMAGES}
                  title={
                    visionOk
                      ? 'Attach image'
                      : 'Current model has no vision support — load a vision model to attach images'
                  }
                  className="px-2.5 py-2 border border-line text-mute hover:text-text hover:bg-surface2 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Image size={16} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </>
            )}
            {generating ? (
              <button
                onClick={onStop}
                className="font-mono text-[12px] px-3 py-2 border border-err/60 text-err hover:bg-err/10"
              >
                stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="flex items-center gap-1 font-mono text-[12px] px-3 py-2 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30"
              >
                send <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-mute">
          <div className="flex items-center gap-2">
            {contextTotal > 0 ? (
              <ContextRing used={contextUsed} total={contextTotal} />
            ) : (
              <span>{model ? `model · ${shortenModelId(model)}` : 'no model loaded'}</span>
            )}
            {compacting && (
              <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-accent/70">
                <Loader2 size={9} className="animate-spin" /> compacting…
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {toolControls}
            <Tooltip label={reasoningTooltip}>
              <div className="flex items-center gap-1">
                <Brain size={11} className={reasoningEffort !== 'off' ? 'text-accent' : 'text-mute/50'} />
                {reasoningCapability === 'toggle' ? (
                  <button
                    onClick={() => onReasoningChange(reasoningEffort === 'off' ? 'high' : 'off')}
                    className={`px-1.5 py-0.5 border transition-colors ${
                      reasoningEffort !== 'off'
                        ? 'border-accent/60 text-accent bg-accent/10'
                        : 'border-line text-mute/60 hover:text-mute'
                    }`}
                  >
                    think {reasoningEffort !== 'off' ? 'on' : 'off'}
                  </button>
                ) : (
                  <div className="flex -space-x-px">
                    {(['off', 'low', 'medium', 'high'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => onReasoningChange(level)}
                        className={`px-1.5 py-0.5 border transition-colors ${
                          reasoningEffort === level
                            ? level === 'off'
                              ? 'border-line text-mute bg-surface z-10'
                              : 'border-accent/60 text-accent bg-accent/10 z-10'
                            : 'border-line text-mute/50 hover:text-mute'
                        }`}
                      >
                        {level === 'medium' ? 'med' : level}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Tooltip>
            <button
              onClick={onParams}
              disabled={!modelReady}
              className={modelReady ? 'hover:text-text' : 'opacity-50 cursor-not-allowed'}
            >
              thread parameters →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
