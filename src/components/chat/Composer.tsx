import { useState, useRef, useEffect, useCallback } from 'react';
import type { PromptTemplate } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import { compressImage, compressFromDataTransfer } from '../../lib/image';
import { PromptHints } from './PromptHints';

const MAX_IMAGES = 3;

export function Composer({
  modelReady,
  visionSupported,
  generating,
  templates,
  onSend,
  onStop,
}: {
  modelReady: boolean;
  visionSupported: boolean;
  generating: boolean;
  templates: PromptTemplate[];
  onSend: (text: string, images?: ChatImage[]) => void;
  onStop: () => void;
}) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ChatImage[]>([]);
  const [showHints, setShowHints] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [input]);

  const promptQuery = input.startsWith('/') && input.length < 40 ? input.slice(1) : null;

  useEffect(() => {
    setShowHints(promptQuery !== null);
  }, [promptQuery]);

  const handleSend = useCallback(() => {
    if (!input.trim() || !modelReady || generating) return;
    onSend(input.trim(), images.length > 0 ? images : undefined);
    setInput('');
    setImages([]);
  }, [input, images, modelReady, generating, onSend]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (showHints) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, showHints],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (!visionSupported || images.length >= MAX_IMAGES) return;
      const img = await compressFromDataTransfer(e.clipboardData.items);
      if (img) {
        e.preventDefault();
        setImages((prev) => [...prev, img]);
      }
    },
    [visionSupported, images.length],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (let i = 0; i < files.length && images.length + i < MAX_IMAGES; i++) {
        const file = files[i];
        if (file) {
          const img = await compressImage(file);
          setImages((prev) => [...prev, img]);
        }
      }
      e.target.value = '';
    },
    [images.length],
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-err text-bg text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          {showHints && promptQuery !== null && (
            <PromptHints
              query={promptQuery}
              templates={templates}
              onSelect={(content) => {
                setInput(content);
                setShowHints(false);
              }}
              onDismiss={() => setShowHints(false)}
            />
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              onPaste={handlePaste}
              placeholder={
                modelReady
                  ? 'Type a message — Enter to send, Shift+Enter for newline'
                  : 'Load a model to begin'
              }
              disabled={!modelReady}
              rows={1}
              className="flex-1 resize-none bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-2 text-[14px] text-text placeholder:text-mute font-sans disabled:opacity-40"
              style={{ maxHeight: '180px' }}
            />
            {visionSupported && modelReady && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={images.length >= MAX_IMAGES}
                  className="font-mono text-[12px] px-3 py-2 border border-line text-mute hover:text-text hover:bg-surface2 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Attach image"
                >
                  img
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
                onClick={handleSend}
                disabled={!modelReady || !input.trim()}
                className="font-mono text-[12px] px-3 py-2 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                send →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
