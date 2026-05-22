import { useEffect, useRef } from 'react';
import type { Message, PromptTemplate } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import { MessageView } from './MessageView';
import { Composer } from './Composer';
import { EmptyState } from './EmptyState';

export function ChatPanel({
  messages,
  generating,
  modelReady,
  visionSupported,
  loadedModelId,
  templates,
  onSend,
  onStop,
}: {
  messages: Message[];
  generating: boolean;
  modelReady: boolean;
  visionSupported: boolean;
  loadedModelId: string | null;
  templates: PromptTemplate[];
  onSend: (text: string, images?: ChatImage[]) => void;
  onStop: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <EmptyState modelReady={modelReady} loadedModelId={loadedModelId} />
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((m, i) => (
              <MessageView
                key={m.id}
                message={m}
                modelId={loadedModelId}
                streaming={
                  generating &&
                  i === messages.length - 1 &&
                  m.role === 'assistant'
                }
              />
            ))}
          </div>
        )}
      </div>

      <Composer
        modelReady={modelReady}
        visionSupported={visionSupported}
        generating={generating}
        templates={templates}
        onSend={onSend}
        onStop={onStop}
      />
    </div>
  );
}
