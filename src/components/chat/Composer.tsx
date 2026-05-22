import { useState, useRef, useEffect, useCallback } from 'react';
import type { PromptTemplate, ReasoningEffort, ReasoningCapability } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import { compressImage, compressFromDataTransfer } from '../../lib/image';
import { shortenModelId } from '../../lib/format';
import { Image, ArrowRight, Brain } from 'lucide-react';
import { PromptHints } from './PromptHints';

const MAX_IMAGES = 3;

function ContextRing({
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
  const color = pct > 0.9 ? '#ef4444' : pct > 0.7 ? '#eab308' : '#f59e0b';
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
}

export function Composer({
  modelReady,
  model,
  visionOk,
  generating,
  templates,
  contextUsed,
  contextTotal,
  reasoningCapability,
  reasoningEffort,
  onReasoningChange,
  onSend,
  onStop,
  onParams,
}: {
  modelReady: boolean;
  model: string | null;
  visionOk: boolean;
  generating: boolean;
  templates: PromptTemplate[];
  contextUsed: number;
  contextTotal: number;
  reasoningCapability?: ReasoningCapability;
  reasoningEffort: ReasoningEffort;
  onReasoningChange: (effort: ReasoningEffort) => void;
  onSend: (text: string, images?: ChatImage[]) => void;
  onStop: () => void;
  onParams: () => void;
}) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ChatImage[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      if (!visionOk || images.length >= MAX_IMAGES) return;
      const img = await compressFromDataTransfer(e.clipboardData.items);
      if (img) {
        e.preventDefault();
        setImages((prev) => [...prev, img]);
      }
    },
    [visionOk, images.length],
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
          {hintQuery !== null && (
            <PromptHints
              query={hintQuery}
              templates={templates}
              onPick={(t) => setInput(t.content)}
            />
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && hintQuery === null) {
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
          {contextTotal > 0 ? (
            <ContextRing used={contextUsed} total={contextTotal} />
          ) : (
            <span>{model ? `model · ${shortenModelId(model)}` : 'no model loaded'}</span>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span title="Reasoning effort — controls how much the model thinks before responding">
                <Brain size={11} className={reasoningEffort !== 'off' ? 'text-accent' : 'text-mute/50'} />
              </span>
              {reasoningCapability === 'toggle' ? (
                <button
                  onClick={() => onReasoningChange(reasoningEffort === 'off' ? 'high' : 'off')}
                  title="Reasoning effort — controls how much the model thinks before responding"
                  className={`px-1.5 py-0.5 border transition-colors ${
                    reasoningEffort !== 'off'
                      ? 'border-accent/60 text-accent bg-accent/10'
                      : 'border-line text-mute/60 hover:text-mute'
                  }`}
                >
                  think {reasoningEffort !== 'off' ? 'on' : 'off'}
                </button>
              ) : (
                <div className="flex -space-x-px" title="Reasoning effort — controls how much the model thinks before responding">
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
