import { useRef, useEffect, useCallback } from 'react';
import type { Thread, Message, ModelInfo, ModelParams, PromptTemplate, ReasoningEffort, ReasoningCapability, ConversationSummary } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import type { LibraryWithStats } from '../../hooks/useKnowledge';
import type { ConversationBudget } from '../../hooks/useChat';
import { SystemPromptBar } from './SystemPromptBar';
import { MessageView } from './MessageView';
import { EmptyState } from './EmptyState';
import { Composer } from './Composer';
import { SummaryDivider } from './SummaryDivider';

export function ChatPage({
  thread,
  messages,
  budget,
  models,
  loadedModelId,
  modelReady,
  generating,
  templates,
  defaultSystemPrompt,
  params,
  visionOk,
  reasoningCapability,
  onReasoningChange,
  onSend,
  onStop,
  onRegenerate,
  onEditAndResend,
  onOpenPicker,
  onParams,
  onChangeSystemPrompt,
  libraries,
  ragLibraryId,
  onChangeRagLibrary,
  onNewLibrary,
  activeSummary,
  compacting,
  onCompactNow,
  onClearSummary,
}: {
  thread: Thread | null;
  messages: Message[];
  /** Token-budget snapshot from useChat — drives the composer meter
   *  and surfaces sliding-window drop counts. Null while no thread is
   *  loaded; otherwise updated whenever messages/params/system change. */
  budget: ConversationBudget | null;
  /** D10b — active compaction summary for this thread (null if none).
   *  Renders as an inline divider above the message list and gates the
   *  "Compact now" button label. */
  activeSummary: ConversationSummary | null;
  /** True while a compaction LLM call is in flight. */
  compacting: boolean;
  /** Manual "Compact now" — summarizes everything except the latest
   *  user turn. Resolves to true if a new summary was persisted. */
  onCompactNow: () => Promise<boolean>;
  /** Clear the active summary (kept in IDB inactive). */
  onClearSummary: () => Promise<void>;
  models: ModelInfo[];
  loadedModelId: string | null;
  modelReady: boolean;
  generating: boolean;
  templates: PromptTemplate[];
  defaultSystemPrompt: string;
  params: ModelParams;
  visionOk: boolean;
  reasoningCapability?: ReasoningCapability;
  onReasoningChange: (effort: ReasoningEffort) => void;
  onSend: (text: string, images?: ChatImage[]) => void;
  onStop: () => void;
  onRegenerate: () => void;
  onEditAndResend: (messageId: string, newText: string) => void;
  onOpenPicker: () => void;
  onParams: () => void;
  onChangeSystemPrompt: (value: string) => void;
  /** Knowledge bindings — forwarded to the composer chip. */
  libraries: LibraryWithStats[];
  ragLibraryId: string | null;
  onChangeRagLibrary: (id: string | null) => void;
  onNewLibrary: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Token meter source: prefer the live budget snapshot (predicts what
  // *would* be sent on the next request). Falls back to the model's
  // last reported usage when budget is unavailable (e.g. fresh thread
  // with no params yet). Both estimates only.
  const contextUsed = budget
    ? budget.systemTokens + budget.conversationTokens
    : (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          const u = messages[i]?.usage;
          if (u) return u.promptTokens + u.completionTokens;
        }
        return 0;
      })();

  const handleRegenerate = useCallback(() => {
    if (!modelReady) {
      onOpenPicker();
      return;
    }
    onRegenerate();
  }, [modelReady, onOpenPicker, onRegenerate]);

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
            {(() => {
              // D10b — render the SummaryDivider above the first message
              // NOT covered by the active summary. Covered messages stay
              // visible in the UI (we never delete them from IDB) but the
              // divider visually marks "from here down is what the model
              // sees verbatim; above is captured by the summary."
              const coveredIds = activeSummary
                ? new Set(activeSummary.replacedMessageIds)
                : null;
              const firstFreshIdx = coveredIds
                ? messages.findIndex((m) => !coveredIds.has(m.id))
                : -1;
              return messages.map((m, i) => (
                <div key={m.id}>
                  {activeSummary && i === firstFreshIdx && (
                    <SummaryDivider
                      summary={activeSummary}
                      onClear={onClearSummary}
                    />
                  )}
                  <MessageView
                    message={m}
                    modelId={loadedModelId}
                    models={models}
                    streaming={generating && i === messages.length - 1 && m.role === 'assistant'}
                    isLast={i === messages.length - 1}
                    generating={generating}
                    onRegenerate={handleRegenerate}
                    onEditAndResend={onEditAndResend}
                  />
                </div>
              ));
            })()}
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
        droppedCount={budget?.droppedCount ?? 0}
        summarizedCount={budget?.summarizedCount ?? 0}
        compacting={compacting}
        onCompactNow={onCompactNow}
        reasoningCapability={reasoningCapability}
        reasoningEffort={params.reasoningEffort}
        onReasoningChange={onReasoningChange}
        onSend={onSend}
        onStop={onStop}
        onParams={onParams}
        libraries={libraries}
        ragLibraryId={ragLibraryId}
        onChangeRagLibrary={onChangeRagLibrary}
        onNewLibrary={onNewLibrary}
      />
    </div>
  );
}
