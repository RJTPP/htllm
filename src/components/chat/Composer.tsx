import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import type { PromptTemplate, ReasoningEffort, ReasoningCapability } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import { compressImage, compressFromDataTransfer } from '../../lib/image';
import { shortenModelId } from '../../lib/format';
import { Image, ArrowRight, Brain, FileText, Loader2 } from 'lucide-react';
import { PromptHints } from './PromptHints';
import { Tooltip } from '../ui/Tooltip';
import { KnowledgeChip } from './KnowledgeChip';
import type { LibraryWithStats } from '../../hooks/useKnowledge';

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
  const color = pct > 0.9 ? '#ef4444' : pct > 0.7 ? '#eab308' : 'rgb(var(--accent))';
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
  droppedCount = 0,
  summarizedCount = 0,
  compacting = false,
  onCompactNow,
  reasoningCapability,
  reasoningEffort,
  onReasoningChange,
  onSend,
  onStop,
  onParams,
  libraries,
  ragLibraryId,
  onChangeRagLibrary,
  onNewLibrary,
}: {
  modelReady: boolean;
  model: string | null;
  visionOk: boolean;
  generating: boolean;
  templates: PromptTemplate[];
  contextUsed: number;
  contextTotal: number;
  /** D10a — number of older messages dropped by the token-budget
   *  sliding window. When > 0, a small "trimmed" chip appears next
   *  to the context meter so the user knows older context is gone. */
  droppedCount?: number;
  /** D10b — number of messages covered by the active summary. When > 0,
   *  a small "summarized N" chip appears next to the meter. */
  summarizedCount?: number;
  /** D10b — true while a compaction LLM call is in flight. The
   *  "Compact now" button shows a spinner and disables. */
  compacting?: boolean;
  /** D10b — manual "Compact now". Hides the button entirely when not
   *  wired (useChat exposes it; some surfaces may not). */
  onCompactNow?: () => Promise<boolean>;
  reasoningCapability?: ReasoningCapability;
  reasoningEffort: ReasoningEffort;
  onReasoningChange: (effort: ReasoningEffort) => void;
  onSend: (text: string, images?: ChatImage[]) => void;
  onStop: () => void;
  onParams: () => void;
  /** Knowledge bindings — pass the full library list so the chip can
   *  show names and surface "no model pinned" warn states. */
  libraries: LibraryWithStats[];
  ragLibraryId: string | null;
  onChangeRagLibrary: (id: string | null) => void;
  onNewLibrary: () => void;
}) {
  const [input, setInput] = useState('');
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

  // Templates matching the current /-query, and the keyboard-selected one.
  const hintMatches = useMemo(() => {
    if (hintQuery === null) return [];
    const q = hintQuery.toLowerCase();
    return templates.filter((t) => t.title.toLowerCase().includes(q));
  }, [hintQuery, templates]);
  const hintsOpen = hintMatches.length > 0;

  const [hintIndex, setHintIndex] = useState(0);
  // Reset the selection whenever the query changes.
  useEffect(() => {
    setHintIndex(0);
  }, [hintQuery]);

  const pickTemplate = (t: PromptTemplate) => {
    setInput(t.content);
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
            <PromptHints
              matches={hintMatches}
              selectedIndex={hintIndex}
              onPick={pickTemplate}
              onHover={setHintIndex}
            />
          )}
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
                    setHintIndex((i) => Math.min(i + 1, hintMatches.length - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHintIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const t = hintMatches[hintIndex];
                    if (t) pickTemplate(t);
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
                  ? 'Type a message — / for templates, Enter to send'
                  : "Type a message — you'll pick a model on send"
              }
              className="flex-1 resize-none bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-2 text-[14px] text-text placeholder:text-mute"
              style={{ maxHeight: '180px' }}
            />
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
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-mute">
          <div className="flex items-center gap-2">
            {contextTotal > 0 ? (
              <ContextRing used={contextUsed} total={contextTotal} />
            ) : (
              <span>{model ? `model · ${shortenModelId(model)}` : 'no model loaded'}</span>
            )}
            {droppedCount > 0 && (
              <span
                title={`${droppedCount} older message${droppedCount === 1 ? '' : 's'} dropped to fit the context window`}
                className="font-mono text-[9px] text-warn/80 border border-warn/40 px-1 leading-[14px] uppercase tracking-wider"
              >
                −{droppedCount} trimmed
              </span>
            )}
            {summarizedCount > 0 && (
              <span
                title={`${summarizedCount} older turn${summarizedCount === 1 ? '' : 's'} represented by a summary block instead of full text`}
                className="inline-flex items-center gap-0.5 font-mono text-[9px] text-accent border border-accent/40 bg-accent/5 px-1 leading-[14px] uppercase tracking-wider"
              >
                <FileText size={9} />
                ≡{summarizedCount}
              </span>
            )}
            {onCompactNow && (
              <button
                type="button"
                onClick={() => {
                  void onCompactNow();
                }}
                disabled={compacting || !modelReady}
                title={
                  modelReady
                    ? 'Summarize older turns now — keeps the latest exchange verbatim'
                    : 'Load a chat model first'
                }
                className="font-mono text-[9px] uppercase tracking-wider text-mute hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5"
              >
                {compacting ? (
                  <>
                    <Loader2 size={9} className="animate-spin" /> compacting…
                  </>
                ) : (
                  <>compact</>
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <KnowledgeChip
              libraryId={ragLibraryId}
              libraries={libraries}
              onSelect={onChangeRagLibrary}
              onNewLibrary={onNewLibrary}
            />
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
