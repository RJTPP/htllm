import { useRef, useEffect, useCallback } from 'react';
import type { Thread, Message, ModelInfo, ModelParams, PromptTemplate, ReasoningEffort, ReasoningCapability, ConversationSummary } from '../../providers/types';
import type { ChatImage } from '../../lib/image';
import type { LibraryWithStats } from '../../hooks/useKnowledge';
import type { ConversationBudget } from '../../hooks/useChat';
import { ThreadMenu } from './ThreadMenu';
import { MessageView } from './MessageView';
import { EmptyState } from './EmptyState';
import { Composer } from './Composer';
import type { SlashCommand } from './SlashMenu';
import { SummaryDivider } from './SummaryDivider';
import { CompactingIndicator } from './CompactingIndicator';
import { TrimDivider } from './TrimDivider';

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
  historySummary,
  tailSummary,
  compacting,
  slashCommands,
}: {
  thread: Thread | null;
  messages: Message[];
  /** Token-budget snapshot from useChat — drives the composer meter
   *  and surfaces sliding-window drop counts. Null while no thread is
   *  loaded; otherwise updated whenever messages/params/system change. */
  budget: ConversationBudget | null;
  /** D10b — active history summary (older turns folded). Renders as the
   *  "context compacted" divider. Null if none. */
  historySummary: ConversationSummary | null;
  /** D10b — active tail summary (a recent oversized exchange summarized
   *  into its own block). Renders as a separate "last turn summarized"
   *  divider. Null if none. */
  tailSummary: ConversationSummary | null;
  /** True while a compaction LLM call is in flight — shows the
   *  "compacting context…" indicator in place of the empty reply. */
  compacting: boolean;
  /** Slash commands for the composer's `/` menu (actions, incl.
   *  `/compact` which is the manual-compaction entry point now). */
  slashCommands: SlashCommand[];
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

  // Ring measures against the full context window (what the user set),
  // so "X / 4.0k" matches their setting. Auto-compaction fires at 75%
  // of the window and the small output-reserve floor means trimming
  // happens just shy of 100% — both line up with this denominator.
  const contextTotal = budget?.contextWindow ?? params.contextWindow;

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
    <div className="reveal reveal-3 flex flex-col h-full min-h-0 flex-1 relative">
      {/* Floating per-thread menu — system prompt lives here now instead
          of a permanent bar above the messages. */}
      <div className="absolute top-3 right-3 z-10">
        <ThreadMenu
          value={thread.systemPrompt ?? defaultSystemPrompt}
          defaultPrompt={defaultSystemPrompt}
          onChange={onChangeSystemPrompt}
        />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto grid-bg">
        {messages.length === 0 ? (
          <EmptyState onOpenPicker={onOpenPicker} modelReady={modelReady} model={loadedModelId} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 pt-6 pb-6 space-y-5">
            {(() => {
              // D10b — two summary dividers. Covered messages stay visible
              // in the UI (we never delete them from IDB) but a divider
              // marks "above is captured by a summary block; below is sent
              // verbatim." History divider sits above the first message NOT
              // in the history summary; the tail divider sits above the
              // first fully-fresh message (not covered by either summary).
              const historyCovered = historySummary
                ? new Set(historySummary.replacedMessageIds)
                : null;
              const tailCovered = tailSummary
                ? new Set(tailSummary.replacedMessageIds)
                : null;
              const allCovered =
                historyCovered || tailCovered
                  ? new Set([
                      ...(historySummary?.replacedMessageIds ?? []),
                      ...(tailSummary?.replacedMessageIds ?? []),
                    ])
                  : null;
              const historyDividerIdx = historyCovered
                ? messages.findIndex((m) => !historyCovered.has(m.id))
                : -1;
              const tailDividerIdx = tailSummary
                ? messages.findIndex((m) => !allCovered!.has(m.id))
                : -1;
              // For the trim divider math below: first fully-fresh message.
              const firstFreshIdx = allCovered
                ? messages.findIndex((m) => !allCovered.has(m.id))
                : -1;

              // Trim horizon: the oldest message actually sent verbatim on
              // the last fit. Messages between the summary boundary and
              // this index are in the UI but weren't sent (sliding window).
              // We only render the divider when there's a genuine gap —
              // i.e. some non-covered message sits above the first-sent one.
              const trimIdx = budget?.firstSentMessageId
                ? messages.findIndex((m) => m.id === budget.firstSentMessageId)
                : -1;
              const summaryEnd = firstFreshIdx === -1 ? 0 : firstFreshIdx;
              const trimmedCount =
                trimIdx > summaryEnd ? trimIdx - summaryEnd : 0;

              return messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                // While compacting, the trailing assistant placeholder is
                // empty (the stream hasn't started). Suppress it and show
                // the "compacting context…" divider in its place. (#4)
                const suppressForCompacting =
                  compacting && isLast && m.role === 'assistant';
                return (
                  <div key={m.id}>
                    {historySummary && i === historyDividerIdx && (
                      <SummaryDivider summary={historySummary} />
                    )}
                    {tailSummary && i === tailDividerIdx && (
                      <SummaryDivider summary={tailSummary} label="last turn summarized" />
                    )}
                    {trimmedCount > 0 && i === trimIdx && (
                      <TrimDivider count={trimmedCount} />
                    )}
                    {suppressForCompacting ? (
                      <CompactingIndicator />
                    ) : (
                      <MessageView
                        message={m}
                        modelId={loadedModelId}
                        models={models}
                        streaming={generating && isLast && m.role === 'assistant'}
                        isLast={isLast}
                        generating={generating}
                        onRegenerate={handleRegenerate}
                        onEditAndResend={onEditAndResend}
                        locked={allCovered?.has(m.id) ?? false}
                      />
                    )}
                  </div>
                );
              });
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
        contextTotal={contextTotal}
        compacting={compacting}
        slashCommands={slashCommands}
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
