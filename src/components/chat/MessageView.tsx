import type { Message, ContentPart } from '../../providers/types';
import { shortenModelId } from '../../lib/format';

function renderContent(content: string | ContentPart[]) {
  if (typeof content === 'string') return content;

  return content.map((part, i) => {
    if (part.type === 'text') {
      return <span key={i}>{part.text}</span>;
    }
    return (
      <img
        key={i}
        src={part.image_url.url}
        alt="Attached image"
        className="max-w-xs max-h-64 border border-line mt-2"
        width={part.dimension?.width}
        height={part.dimension?.height}
      />
    );
  });
}

export function MessageView({
  message,
  streaming,
  modelId,
}: {
  message: Message;
  streaming: boolean;
  modelId: string | null;
}) {
  const isUser = message.role === 'user';

  return (
    <div className="space-y-1.5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-mute">
        {isUser ? 'you' : shortenModelId(modelId ?? 'model')}
      </div>
      <div
        className={`${
          isUser
            ? 'text-text'
            : 'text-text font-mono text-[13.5px] leading-relaxed'
        } whitespace-pre-wrap break-words`}
      >
        {renderContent(message.content)}
        {streaming && (
          <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 align-middle animate-pulse-dot" />
        )}
      </div>
      {!streaming && message.usage && (
        <div className="font-mono text-[10px] text-mute flex gap-3 mt-1">
          <span>{message.usage.promptTokens} prompt</span>
          <span>{message.usage.completionTokens} completion</span>
          {message.usage.prefillTokensPerSecond != null && (
            <span>{message.usage.prefillTokensPerSecond.toFixed(1)} prefill tok/s</span>
          )}
          {message.usage.decodeTokensPerSecond != null && (
            <span>{message.usage.decodeTokensPerSecond.toFixed(1)} decode tok/s</span>
          )}
        </div>
      )}
    </div>
  );
}
