import { useState, useRef, useEffect } from 'react';
import type { Message, ModelInfo, ContentPart, UsageStats } from '../../providers/types';
import { shortenModelId, fmtRelativeTime } from '../../lib/format';
import { Info, RefreshCw, Pencil, X, Check } from 'lucide-react';
import { Avatar } from './Avatar';
import { MessageBody } from './MessageBody';

function splitContent(content: string | ContentPart[]): { text: string; images: string[] } {
  if (typeof content === 'string') return { text: content, images: [] };
  let text = '';
  const images: string[] = [];
  for (const part of content) {
    if (part.type === 'text') text += part.text;
    else images.push(part.image_url.url);
  }
  return { text, images };
}

function UsageInline({ usage }: { usage: UsageStats }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-mute border-t border-line/60 pt-1.5">
      <span>{usage.promptTokens} prompt tok</span>
      <span>{usage.completionTokens} completion tok</span>
      {usage.prefillTokensPerSecond != null && (
        <span className="text-mute/70">prefill {usage.prefillTokensPerSecond.toFixed(1)} tok/s</span>
      )}
      {usage.decodeTokensPerSecond != null && (
        <span className="text-mute/70">decode {usage.decodeTokensPerSecond.toFixed(1)} tok/s</span>
      )}
    </div>
  );
}

export function MessageView({
  message,
  modelId,
  models,
  streaming,
  isLast,
  generating,
  onRegenerate,
  onEditAndResend,
}: {
  message: Message;
  modelId: string | null;
  models: ModelInfo[];
  streaming: boolean;
  isLast: boolean;
  generating: boolean;
  onRegenerate: () => void;
  onEditAndResend: (messageId: string, newText: string) => void;
}) {
  const [showUsage, setShowUsage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isUser = message.role === 'user';
  const { text, images } = splitContent(message.content);

  // Auto-focus and auto-size the textarea when entering edit mode.
  useEffect(() => {
    if (editing && editRef.current) {
      const el = editRef.current;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      // Place cursor at end.
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [editing]);

  const startEditing = () => {
    setEditText(text);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditText('');
  };

  const confirmEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditing(false);
    onEditAndResend(message.id, trimmed);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      confirmEdit();
    }
  };

  return (
    <div className="group flex gap-3">
      <Avatar role={message.role} modelId={modelId} models={models} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 overflow-hidden">
          <span className="text-[11px] font-mono text-text/80 whitespace-nowrap">
            {isUser ? 'You' : (modelId && shortenModelId(modelId)) || 'Assistant'}
          </span>
          <span className="text-[10px] font-mono text-mute/60 shrink-0">
            {fmtRelativeTime(message.createdAt)}
          </span>
        </div>

        {isUser ? (
          editing ? (
            <div className="max-w-full space-y-2">
              {images.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {images.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Attachment ${i + 1}`}
                      className="w-24 h-24 object-cover border border-line"
                    />
                  ))}
                </div>
              )}
              <textarea
                ref={editRef}
                value={editText}
                onChange={(e) => {
                  setEditText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={handleEditKeyDown}
                className="w-full bg-bg border border-accent/60 focus:outline-none px-3 py-2 text-[13px] text-text resize-none font-sans"
                rows={1}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={confirmEdit}
                  disabled={!editText.trim()}
                  className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30"
                >
                  <Check size={12} /> save & resend
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 border border-line text-mute hover:text-text"
                >
                  <X size={12} /> cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="inline-block max-w-full bg-surface2 border border-line rounded-lg rounded-tl-sm px-3 py-2">
                {images.length > 0 && (
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {images.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Attachment ${i + 1}`}
                        className="w-24 h-24 object-cover border border-line"
                      />
                    ))}
                  </div>
                )}
                {text && <MessageBody content={text} />}
              </div>
              {!generating && (
                <div className="mt-1.5">
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border border-transparent text-mute opacity-0 group-hover:opacity-100 hover:text-text transition-opacity"
                    title="Edit message"
                  >
                    <Pencil size={11} /> edit
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="pr-2">
            <MessageBody content={text} />
            {streaming && (
              <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 align-middle blink" />
            )}
          </div>
        )}

        {!isUser && !streaming && (message.usage || isLast) && (
          <div className="mt-1.5 flex items-center gap-1">
            {message.usage && (
              <button
                onClick={() => setShowUsage((s) => !s)}
                className={`flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  showUsage ? 'border-line text-text' : 'border-transparent text-mute hover:text-text'
                }`}
                title="Generation stats"
              >
                <Info size={12} /> stats
              </button>
            )}
            {isLast && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border border-transparent text-mute hover:text-text"
                title="Regenerate response"
              >
                <RefreshCw size={12} /> regenerate
              </button>
            )}
          </div>
        )}
        {!isUser && showUsage && message.usage && <UsageInline usage={message.usage} />}
      </div>
    </div>
  );
}
