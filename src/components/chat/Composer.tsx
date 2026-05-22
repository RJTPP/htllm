import { useState, useRef, useEffect, useCallback } from 'react';
import type { PromptTemplate } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import { compressImage, compressFromDataTransfer } from '../../lib/image';
import { shortenModelId } from '../../lib/format';
import { Icon } from '../ui/Icon';
import { PromptHints } from './PromptHints';

const MAX_IMAGES = 3;

export function Composer({
  modelReady,
  model,
  visionOk,
  generating,
  templates,
  onSend,
  onStop,
  onParams,
  onOpenPicker,
}: {
  modelReady: boolean;
  model: string | null;
  visionOk: boolean;
  generating: boolean;
  templates: PromptTemplate[];
  onSend: (text: string, images?: ChatImage[]) => void;
  onStop: () => void;
  onParams: () => void;
  onOpenPicker: () => void;
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
    // No model yet — keep the draft and open the picker instead of sending.
    if (!modelReady) {
      onOpenPicker();
      return;
    }
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
                  <Icon name="image" size={16} />
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
                send <Icon name="send" size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-mute">
          <span>{model ? `model · ${shortenModelId(model)}` : 'no model loaded'}</span>
          <button onClick={onParams} className="hover:text-text" disabled={!modelReady}>
            thread parameters →
          </button>
        </div>
      </div>
    </div>
  );
}
