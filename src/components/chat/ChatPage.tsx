import { useRef, useEffect, useMemo } from 'react';
import type { Thread, Message, ModelInfo, ModelParams, PromptTemplate, ReasoningEffort, ReasoningCapability } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import { SystemPromptBar } from './SystemPromptBar';
import { MessageView } from './MessageView';
import { EmptyState } from './EmptyState';
import { Composer } from './Composer';

export function ChatPage({
  thread,
  messages,
  models,
  loadedModelId,
  modelReady,
  generating,
  templates,
  defaultSystemPrompt,
  params,
  reasoningCapability,
  onReasoningChange,
  onSend,
  onStop,
  onRegenerate,
  onEditAndResend,
  onOpenPicker,
  onParams,
  onChangeSystemPrompt,
}: {
  thread: Thread | null;
  messages: Message[];
  models: ModelInfo[];
  loadedModelId: string | null;
  modelReady: boolean;
  generating: boolean;
  templates: PromptTemplate[];
  defaultSystemPrompt: string;
  params: ModelParams;
  reasoningCapability?: ReasoningCapability;
  onReasoningChange: (effort: ReasoningEffort) => void;
  onSend: (text: string, images?: ChatImage[]) => void;
  onStop: () => void;
  onRegenerate: () => void;
  onEditAndResend: (messageId: string, newText: string) => void;
  onOpenPicker: () => void;
  onParams: () => void;
  onChangeSystemPrompt: (value: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const visionOk = !!models.find((m) => m.id === loadedModelId)?.vision;

  const contextUsed = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const u = messages[i]?.usage;
      if (u) return u.promptTokens + u.completionTokens;
    }
    return 0;
  }, [messages]);

  const handleRegenerate = () => {
    if (!modelReady) {
      onOpenPicker();
      return;
    }
    onRegenerate();
  };

  if (!thread) {
    return (
      <div className="reveal reveal-3 flex-1 overflow-y-auto grid-bg">
        <EmptyState onOpenPicker={onOpenPicker} modelReady={modelReady} model={loadedModelId} />
      </div>
    );
  }

  return (
    <div className="reveal reveal-3 flex flex-col h-full min-h-0 flex-1">
      <div ref={scrollRef} className="flex-1 overflow-y-auto grid-bg">
        <div className="max-w-3xl mx-auto px-6 pt-6 pb-1">
          <SystemPromptBar
            value={thread.systemPrompt ?? defaultSystemPrompt}
            defaultPrompt={defaultSystemPrompt}
            onChange={onChangeSystemPrompt}
          />
        </div>
        {messages.length === 0 ? (
          <EmptyState onOpenPicker={onOpenPicker} modelReady={modelReady} model={loadedModelId} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 pb-6 space-y-5">
            {messages.map((m, i) => (
              <MessageView
                key={m.id}
                message={m}
                modelId={loadedModelId}
                models={models}
                streaming={generating && i === messages.length - 1 && m.role === 'assistant'}
                isLast={i === messages.length - 1}
                generating={generating}
                onRegenerate={handleRegenerate}
                onEditAndResend={onEditAndResend}
              />
            ))}
          </div>
        )}
      </div>
      <Composer
        modelReady={modelReady}
        model={loadedModelId}
        visionOk={visionOk}
        generating={generating}
        templates={templates}
        contextUsed={contextUsed}
        contextTotal={params.contextWindow}
        reasoningCapability={reasoningCapability}
        reasoningEffort={params.reasoningEffort}
        onReasoningChange={onReasoningChange}
        onSend={onSend}
        onStop={onStop}
        onParams={onParams}
      />
    </div>
  );
}
