import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Message,
  ModelParams,
  ContentPart,
  UsageStats,
  ChatProvider,
} from '../providers/types';
import type { ChatImage } from '../lib/image';
import { addMessage, getMessages, updateMessage, deleteMessage, deleteMessagesAfter } from '../data/messages';
import { stripThinking } from '../lib/thinking';
import { buildRagContext } from '../lib/rag-context';
import { getLibrary } from '../data/libraries';
import { getEmbeddingProvider } from '../providers/registry';
import {
  fitToBudget,
  recencyBoundaryIndex,
  reserveForResponse,
  sliceByUserTurns,
} from '../lib/conversation-budget';
import {
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateStringTokens,
} from '../lib/tokens';
import {
  getCalibrationRatio,
  recordCalibrationSample,
} from '../lib/token-calibration';
import { compact, formatSummaryBlock } from '../lib/compact';
import {
  clearActiveSummary,
  getActiveSummary,
  saveSummary,
} from '../data/summaries';
import {
  type CompressionMode,
  COMPACT_KEEP_EXCHANGES,
  COMPACT_MIN_ELIGIBLE_TOKENS,
  COMPACT_TRIGGER_FRACTION,
  DEFAULT_COMPRESSION_MODE,
  MAX_COMPACTIONS_PER_THREAD,
  MIN_AUTO_COMPACT_CONTEXT_TOKENS,
  WARN_COMPACTIONS_PER_THREAD,
} from '../data/settings';

/** Extract plain text from a Message.content payload (string or parts). */
function userMessageText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

/**
 * RAG configuration — per-thread library binding. Library presence IS
 * the state: `libraryId === null` means no retrieval; any library id
 * means retrieve from that library through its pinned embedding model.
 *
 * useChat resolves provider + model internally so callers don't have
 * to thread embedding state through props. If the library or its model
 * disappears between binding and generation, RAG is silently skipped
 * (chat still works).
 */
export interface RagConfig {
  libraryId: string | null;
}

/**
 * Snapshot of the most recent prompt's token budget. Updated on every
 * send() and lightly recomputed when messages/system/params change so
 * the token meter has something to show before the user sends.
 *
 * Counts are estimates (chars/4 + per-message overhead) — accurate
 * within ~10%, plenty for the green/amber/red threshold bands. Never
 * trusted for exact fit decisions; that's what the response reserve
 * is for.
 */
export interface ConversationBudget {
  contextWindow: number;
  systemTokens: number;
  conversationTokens: number;
  droppedTokens: number;
  droppedCount: number;
  responseReserve: number;
  /** D10b — when an active summary block is in the system prompt, its
   *  token cost is reported separately so the meter can break out
   *  "system + summary + conversation" if it wants. Falls back to 0
   *  when no summary is active. */
  summaryTokens: number;
  /** Number of messages currently covered by the active summary (i.e.
   *  excluded from the conversation tail but represented as a block). */
  summarizedCount: number;
  /** Id of the oldest message actually sent verbatim on the last fit.
   *  Messages above this in the list (that aren't covered by a summary)
   *  were trimmed by the sliding window — i.e. not sent to the model.
   *  Drives the inline trim divider. Null when nothing was kept. */
  firstSentMessageId: string | null;
}

export function useChat(
  provider: ChatProvider,
  modelId: string,
  threadId: string | null,
  params: ModelParams,
  systemPrompt: string,
  onThreadUpdate?: (threadId: string) => void,
  onAutoTitle?: (threadId: string, firstMessage: string) => void,
  rag?: RagConfig,
  /** D10b — what to do when the sliding window would drop messages.
   *  Default 'auto'. Falls back to 'drop' when the context window is
   *  too small for auto-compaction to help (see MIN_AUTO_COMPACT). */
  compressionMode: CompressionMode = DEFAULT_COMPRESSION_MODE,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [generating, setGenerating] = useState(false);
  const [budget, setBudget] = useState<ConversationBudget | null>(null);
  // D10b — current active summary for the loaded thread, kept in state so
  // the inline divider in MessageView can render the "── summarized N
  // turns ──" block and the budget snapshot can reflect summary cost.
  const [activeSummary, setActiveSummary] = useState<
    import('../providers/types').ConversationSummary | null
  >(null);
  const [compacting, setCompacting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Ref keeps the latest messages accessible from callbacks without adding
  // `messages` to their dependency arrays (which would destabilize them).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Abort any in-flight stream on unmount to prevent stale setState calls.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // D10b — load the active summary whenever the thread changes. The
  // summary lives in the system prompt at send time and on the inline
  // divider in the message list. Null when no compaction has run yet.
  useEffect(() => {
    if (!threadId) {
      setActiveSummary(null);
      return;
    }
    let cancelled = false;
    getActiveSummary(threadId).then((s) => {
      if (!cancelled) setActiveSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // Passive budget snapshot — recompute whenever the loaded thread,
  // params, or system prompt change so the token meter has something
  // accurate to show before the user sends. We don't run RAG here
  // (it's async + costs an embed call); the actual send updates the
  // snapshot with the RAG block included.
  useEffect(() => {
    if (!threadId) {
      setBudget(null);
      return;
    }
    // Exclude messages already covered by the active summary — they're
    // represented by the summary block in the system prompt, not by
    // their own rows in the conversation tail.
    const coveredIds = new Set(activeSummary?.replacedMessageIds ?? []);
    const candidates = coveredIds.size
      ? messages.filter((m) => !coveredIds.has(m.id))
      : messages;
    const trimmed = sliceByUserTurns(candidates, params.historyMsgs);
    const calRatio = getCalibrationRatio(provider.id, modelId);
    const responseReserve = reserveForResponse(
      params.contextWindow,
      params.maxTokens,
    );
    const summaryBlock = activeSummary
      ? formatSummaryBlock(activeSummary.text)
      : '';
    const sysParts = [summaryBlock, systemPrompt.trim()].filter(Boolean);
    const sysText = sysParts.join('\n\n');
    const sysTokens = sysText ? estimateStringTokens(sysText, calRatio) + 4 : 0;
    const summaryTokens = summaryBlock
      ? estimateStringTokens(summaryBlock, calRatio)
      : 0;
    const conversationBudget = Math.max(
      0,
      params.contextWindow - responseReserve - sysTokens,
    );
    const fit = fitToBudget(trimmed, conversationBudget, calRatio);
    setBudget({
      contextWindow: params.contextWindow,
      systemTokens: sysTokens,
      conversationTokens: fit.keptTokens,
      droppedTokens: fit.droppedTokens,
      droppedCount: fit.dropped.length,
      responseReserve,
      summaryTokens,
      summarizedCount: activeSummary?.replacedMessageIds.length ?? 0,
      firstSentMessageId: fit.kept[0]?.id ?? null,
    });
  }, [
    threadId,
    messages,
    params.historyMsgs,
    params.contextWindow,
    params.maxTokens,
    systemPrompt,
    activeSummary,
    provider.id,
    modelId,
  ]);

  // Load messages when thread changes; cancelled flag prevents race condition
  // if the user switches threads before the prior load resolves.
  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    getMessages(threadId).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });
    return () => { cancelled = true; };
  }, [threadId]);

  // Streams an assistant reply for the given visible history. The history is
  // the user-visible message list to answer (no assistant placeholder yet).
  const runGeneration = useCallback(
    async (history: Message[]) => {
      if (!threadId) return;

      const assistantMsg = await addMessage({
        threadId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      });
      setMessages((prev) => [...prev, assistantMsg]);
      setGenerating(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let fullContent = '';
      let fullReasoning = '';
      let finalUsage: UsageStats | undefined;

      try {
        // D10b — load the active summary for this thread (if any). It
        // covers some prefix of `history`, which we filter out here so
        // those messages aren't doubly represented (as both a covered
        // row and a <summary> block).
        const currentSummary = threadId
          ? await getActiveSummary(threadId)
          : null;
        const coveredIds = new Set(currentSummary?.replacedMessageIds ?? []);
        const candidates = coveredIds.size
          ? history.filter((m) => !coveredIds.has(m.id))
          : history;

        // Layer 1 (user-turn slicing): cap how many of the user's most
        // recent messages are included. Each user message brings its
        // associated assistant reply along — counting only user turns
        // matches how users think about "history" ("the last N things
        // I asked"). historyMsgs=0 means no cap.
        const trimmed = sliceByUserTurns(candidates, params.historyMsgs);

        // Strip reasoning from assistant messages in history so the model
        // doesn't see its own chain-of-thought. Handles both:
        // - In-content <think>...</think> tags (Qwen3, DeepSeek-R1 local)
        // - Structured `reasoning` field (API providers)
        const cleaned = trimmed.map((m) => {
          if (m.role !== 'assistant') return m;
          let result = m;
          // Remove structured reasoning field.
          if (result.reasoning) {
            result = { ...result, reasoning: undefined };
          }
          // Strip in-content <think> tags.
          if (typeof result.content === 'string') {
            const stripped = stripThinking(result.content);
            if (stripped !== result.content) {
              result = result === m ? { ...result, content: stripped } : { ...result, content: stripped };
            }
          }
          return result;
        });

        // Optional RAG retrieval. Resolves the bound library, its
        // pinned model, and the matching provider inside the hook so
        // App.tsx only has to pass a libraryId. Every silent-fail path
        // logs at debug; chat always proceeds.
        let ragBlock = '';
        if (rag?.libraryId) {
          const lastUser = [...cleaned].reverse().find((m) => m.role === 'user');
          const queryText = lastUser ? userMessageText(lastUser) : '';
          if (queryText) {
            try {
              const lib = await getLibrary(rag.libraryId);
              if (!lib) {
                console.debug('[rag] skipped: bound library no longer exists');
              } else if (!lib.embeddingModelId || !lib.embeddingProviderId) {
                console.debug('[rag] skipped: library has no model pinned');
              } else {
                const ragProvider = getEmbeddingProvider(lib.embeddingProviderId);
                if (!ragProvider) {
                  console.debug('[rag] skipped: provider not registered');
                } else {
                  const result = await buildRagContext(
                    queryText,
                    ragProvider,
                    lib.embeddingModelId,
                    { signal: controller.signal, libraryIds: [lib.id] },
                  );
                  if (result.context) {
                    ragBlock = result.context;
                  } else if (result.reason) {
                    console.debug('[rag] skipped:', result.reason);
                  }
                }
              }
            } catch (err) {
              console.warn('[rag] context build failed:', err);
            }
          }
        }

        // Compose the system message: retrieved context (if any) sits
        // above the summary block (D10b — older turns compacted), which
        // sits above the persona prompt so model-side instructions still
        // have the last word.
        let summaryText = currentSummary?.text ?? '';
        let summaryReplacedCount = currentSummary?.replacedMessageIds.length ?? 0;
        const buildSysContent = () => {
          const summaryBlock = summaryText
            ? formatSummaryBlock(summaryText)
            : '';
          return [ragBlock, summaryBlock, systemPrompt.trim()]
            .filter(Boolean)
            .join('\n\n');
        };
        let sysContent = buildSysContent();
        let sysMsg: Message | null = sysContent
          ? {
              id: '__system',
              threadId,
              role: 'system',
              content: sysContent,
              createdAt: 0,
            }
          : null;

        // Layer 2 (token-budget sliding window): always-on safety net.
        // System message is always sent and counts toward the budget but
        // is never sliced. The conversation tail is fit to whatever room
        // remains after the system message + response reservation.
        const responseReserve = reserveForResponse(
          params.contextWindow,
          params.maxTokens,
        );
        // Per-model calibration multiplier — applied to every estimate so
        // the budget/trigger math tracks the model's real tokenization.
        const calRatio = getCalibrationRatio(provider.id, modelId);
        let sysTokens = sysMsg ? estimateMessageTokens(sysMsg, calRatio) : 0;
        let conversationBudget = Math.max(
          0,
          params.contextWindow - responseReserve - sysTokens,
        );

        // Mutable compaction bookkeeping — `cleaned` already excludes
        // messages covered by the existing summary, so compactedUpTo
        // starts at 0 and advances as each pass summarizes more of the
        // verbatim prefix. The verbatim tail is always
        // cleaned.slice(compactedUpTo).
        let compactedUpTo = 0;
        let curReplacedIds = currentSummary?.replacedMessageIds ?? [];
        let curReplacedTokens = currentSummary?.replacedTokens ?? 0;
        let curGeneration = currentSummary?.generation ?? 0;

        let fit = fitToBudget(cleaned.slice(compactedUpTo), conversationBudget, calRatio);

        // Compact cleaned[compactedUpTo, newUpTo) into the active summary,
        // persist, rebuild the system message, and re-fit the remaining
        // tail. Returns true if a summary was written. Shared by the
        // normal pass and the fat-tail fallback so they can't drift.
        const compactUpTo = async (
          newUpTo: number,
          force = false,
        ): Promise<boolean> => {
          const eligible = cleaned.slice(compactedUpTo, newUpTo);
          if (eligible.length === 0) return false;
          const eligibleTokens = eligible.reduce(
            (s, m) => s + estimateMessageTokens(m, calRatio),
            0,
          );
          // The min-eligible guard avoids burning an LLM call on a sliver
          // during the proactive 75% pass. `force` (the overflow fallback)
          // bypasses it: at true overflow, compacting even a little beats
          // trimming it away.
          if (!force && eligibleTokens < COMPACT_MIN_ELIGIBLE_TOKENS) return false;

          const nextGeneration = curGeneration + 1;
          if (nextGeneration > MAX_COMPACTIONS_PER_THREAD) {
            console.warn(
              `[compact] cap of ${MAX_COMPACTIONS_PER_THREAD} compactions ` +
                'reached for this thread — falling back to drop. Consider ' +
                'starting a new chat for the best quality.',
            );
            return false;
          }
          if (nextGeneration === WARN_COMPACTIONS_PER_THREAD) {
            console.warn(
              `[compact] approaching the cap of ${MAX_COMPACTIONS_PER_THREAD} ` +
                'compactions for this thread — quality degrades with each round.',
            );
          }

          setCompacting(true);
          try {
            const result = await compact(eligible, provider, modelId, {
              priorSummary: summaryText || null,
              signal: controller.signal,
              contextWindow: params.contextWindow,
              calRatio,
            });
            if (!result) return false;
            curReplacedIds = [...curReplacedIds, ...eligible.map((m) => m.id)];
            curReplacedTokens += eligibleTokens;
            const saved = await saveSummary({
              threadId: threadId!,
              text: result.text,
              replacedMessageIds: curReplacedIds,
              replacedTokens: curReplacedTokens,
              summaryTokens: estimateStringTokens(result.text, calRatio),
              source: 'auto',
            });
            setActiveSummary(saved);
            curGeneration = saved.generation;
            summaryText = result.text;
            summaryReplacedCount = saved.replacedMessageIds.length;
            compactedUpTo = newUpTo;

            // Rebuild the system message with the new summary, then re-fit
            // the remaining verbatim tail (usually grows — the summary
            // block is smaller than what it replaced).
            sysContent = buildSysContent();
            sysMsg = sysContent
              ? { id: '__system', threadId, role: 'system', content: sysContent, createdAt: 0 }
              : null;
            sysTokens = sysMsg ? estimateMessageTokens(sysMsg, calRatio) : 0;
            conversationBudget = Math.max(
              0,
              params.contextWindow - responseReserve - sysTokens,
            );
            fit = fitToBudget(cleaned.slice(compactedUpTo), conversationBudget, calRatio);
            return true;
          } finally {
            setCompacting(false);
          }
        };

        // D10b — compression handling. Modes:
        //   'off'  → soft limit: no compaction, no trimming. Send the full
        //            (historyMsgs-sliced) tail as-is and let the provider
        //            be the real context limit — our token estimate is
        //            approximate, so we never pre-emptively block.
        //   'drop' → trim oldest to fit the budget; dropped is gone.
        //   'auto' → proactively summarize when used input crosses the 75%
        //            trigger, keeping the last exchange verbatim; fall back
        //            to keeping only the current query if that tail still
        //            overflows.
        if (compressionMode === 'off') {
          // Soft 100%: bypass the sliding window entirely.
          fit = {
            kept: cleaned,
            dropped: [],
            keptTokens: estimateMessagesTokens(cleaned, calRatio),
            droppedTokens: 0,
            singleMessageOverflow: false,
          };
        } else if (compressionMode === 'auto') {
          const fullConversationTokens = estimateMessagesTokens(cleaned, calRatio);
          // Trigger off the full context window so it matches the meter
          // (which shows used / contextWindow): compact at 75% of the
          // window. Trimming still happens later, at the conversation
          // budget (~window minus the small output floor).
          const usedInput = sysTokens + fullConversationTokens;
          const triggerAt = COMPACT_TRIGGER_FRACTION * params.contextWindow;
          if (
            usedInput > triggerAt &&
            params.contextWindow >= MIN_AUTO_COMPACT_CONTEXT_TOKENS
          ) {
            // Pass 1 — keep the last exchange verbatim (proactive, honors
            // the min-eligible guard).
            const boundary = recencyBoundaryIndex(cleaned, COMPACT_KEEP_EXCHANGES);
            if (boundary > compactedUpTo) await compactUpTo(boundary);

            // Pass 2 (fat-tail fallback) — the protected tail itself still
            // overflows (a huge recent message). Yield the recency floor
            // down to just the current user query and compact the rest,
            // forcing past the min-eligible guard — compacting beats
            // trimming. We never summarize the active query itself.
            if (fit.dropped.length > 0) {
              let lastUserIdx = -1;
              for (let i = cleaned.length - 1; i >= 0; i--) {
                if (cleaned[i]!.role === 'user') {
                  lastUserIdx = i;
                  break;
                }
              }
              if (lastUserIdx > compactedUpTo) await compactUpTo(lastUserIdx, true);
            }
          }
        }
        // 'drop' needs no extra work — the initial fit already trimmed to
        // budget, and that's exactly its semantics.

        if (fit.singleMessageOverflow) {
          console.warn(
            '[chat] latest message exceeds the conversation budget on its own — ' +
              'the provider will likely error. Increase contextWindow or shorten ' +
              'the message.',
            { budget: conversationBudget, used: fit.keptTokens },
          );
        }
        if (fit.dropped.length > 0) {
          console.debug(
            `[chat] sliding window dropped ${fit.dropped.length} message(s) ` +
              `(${fit.droppedTokens} tokens) to fit the budget.`,
          );
        }
        const sendMessages = sysMsg ? [sysMsg, ...fit.kept] : fit.kept;

        // Surface the latest budget snapshot to consumers (token meter
        // in the chat header reads from here). Estimates only — never
        // exact, but accurate enough for the 50/75/90% color tiers.
        const finalSummaryBlock = summaryText
          ? formatSummaryBlock(summaryText)
          : '';
        const finalSummaryTokens = finalSummaryBlock
          ? estimateStringTokens(finalSummaryBlock, calRatio)
          : 0;
        // Raw (uncalibrated) estimate of exactly what we're sending —
        // compared against the provider's reported promptTokens after
        // the stream to refine this model's calibration ratio.
        const rawPromptEstimate = estimateMessagesTokens(sendMessages, 1);
        setBudget({
          contextWindow: params.contextWindow,
          systemTokens: sysTokens,
          conversationTokens: fit.keptTokens,
          droppedTokens: fit.droppedTokens,
          droppedCount: fit.dropped.length,
          responseReserve,
          summaryTokens: finalSummaryTokens,
          summarizedCount: summaryReplacedCount,
          firstSentMessageId: fit.kept[0]?.id ?? null,
        });

        // Throttle UI updates to ~60 fps via requestAnimationFrame.
        // Token chunks arrive at 100+ per second from fast models; flushing
        // on every chunk causes unnecessary React reconciliation work.
        let rafPending = false;
        const flushToState = () => {
          rafPending = false;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...assistantMsg,
              content: fullContent,
              reasoning: fullReasoning || undefined,
              usage: finalUsage,
            };
            return copy;
          });
        };

        // Cap output to whatever room remains so prompt + output stays
        // within the window — the user's maxTokens is the ceiling, not a
        // fixed reservation. When the prompt is small this is the full
        // maxTokens; near a full context it shrinks gracefully.
        const usedInputTokens = sysTokens + fit.keptTokens;
        const effectiveMaxTokens = Math.max(
          64,
          Math.min(params.maxTokens, params.contextWindow - usedInputTokens),
        );

        for await (const chunk of provider.chat({
          messages: sendMessages,
          modelId,
          temperature: params.temperature,
          topP: params.topP,
          maxTokens: effectiveMaxTokens,
          presencePenalty: params.presencePenalty,
          frequencyPenalty: params.frequencyPenalty,
          reasoningEffort: params.reasoningEffort,
          signal: controller.signal,
        })) {
          fullContent += chunk.delta;
          if (chunk.reasoning) fullReasoning += chunk.reasoning;
          if (chunk.usage) finalUsage = chunk.usage;
          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(flushToState);
          }
        }
        // Final flush — ensure the last chunk (with usage/finishReason) is rendered.
        flushToState();

        await updateMessage(assistantMsg.id, {
          content: fullContent,
          reasoning: fullReasoning || undefined,
          usage: finalUsage,
        });

        // Refine this model's token calibration from the real prompt
        // token count the provider reported. Fire-and-forget; a missing
        // promptTokens (some providers omit it) just skips the sample.
        if (finalUsage?.promptTokens) {
          void recordCalibrationSample(
            provider.id,
            modelId,
            rawPromptEstimate,
            finalUsage.promptTokens,
          );
        }
      } catch (err) {
        if (controller.signal.aborted) {
          await updateMessage(assistantMsg.id, {
            content: fullContent,
            reasoning: fullReasoning || undefined,
            usage: finalUsage,
          });
        } else {
          const errorContent = `[error] ${err instanceof Error ? err.message : String(err)}`;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...assistantMsg, content: errorContent };
            return copy;
          });
          await updateMessage(assistantMsg.id, { content: errorContent });
        }
      } finally {
        setGenerating(false);
        abortRef.current = null;
        onThreadUpdate?.(threadId);
      }
    },
    [threadId, modelId, params, systemPrompt, provider, onThreadUpdate, rag],
  );

  const send = useCallback(
    async (text: string, images?: ChatImage[]) => {
      if (!threadId || generating) return;

      const currentMessages = messagesRef.current;
      const isFirstMessage = currentMessages.length === 0;

      let userContent: string | ContentPart[];
      if (images && images.length > 0) {
        userContent = [
          { type: 'text' as const, text },
          ...images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: img.url },
            dimension: { width: img.width, height: img.height },
          })),
        ];
      } else {
        userContent = text;
      }

      const userMsg = await addMessage({
        threadId,
        role: 'user',
        content: userContent,
        createdAt: Date.now(),
      });
      setMessages((prev) => [...prev, userMsg]);

      await runGeneration([...currentMessages, userMsg]);

      if (isFirstMessage) {
        onAutoTitle?.(threadId, text);
      }
    },
    [threadId, generating, runGeneration, onAutoTitle],
  );

  const regenerate = useCallback(async () => {
    if (!threadId || generating) return;
    const currentMessages = messagesRef.current;
    const last = currentMessages[currentMessages.length - 1];
    if (!last || last.role !== 'assistant') return;

    await deleteMessage(last.id);
    const trimmed = currentMessages.slice(0, -1);
    setMessages(trimmed);

    await runGeneration(trimmed);
  }, [threadId, generating, runGeneration]);

  /** Edit a user message and re-generate from that point (truncate-and-replace). */
  const editAndResend = useCallback(
    async (messageId: string, newText: string) => {
      if (!threadId || generating) return;

      const currentMessages = messagesRef.current;

      // Find the target message.
      const idx = currentMessages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = currentMessages[idx]!;
      if (target.role !== 'user') return;

      // Build updated content — preserve images if the original had them.
      let newContent: string | ContentPart[];
      if (typeof target.content !== 'string') {
        // Keep existing image parts, replace text.
        const imageParts = target.content.filter((p) => p.type === 'image_url');
        if (imageParts.length > 0) {
          newContent = [{ type: 'text' as const, text: newText }, ...imageParts];
        } else {
          newContent = newText;
        }
      } else {
        newContent = newText;
      }

      // Update the user message in DB.
      await updateMessage(messageId, { content: newContent });

      // Delete everything after this message.
      const deletedIds = await deleteMessagesAfter(threadId, messageId);

      // Update local state: keep messages up to and including the edited one.
      const kept = currentMessages.filter(
        (_m, i) => i <= idx && !deletedIds.includes(_m.id),
      );
      const editedMsg: Message = { ...target, content: newContent };
      kept[kept.length - 1] = editedMsg;
      setMessages(kept);

      // Re-generate from the updated history.
      await runGeneration(kept);
    },
    [threadId, generating, runGeneration],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * D10b — manual "Compact now". Summarizes everything in the loaded
   * thread except the most recent user turn (which usually represents
   * the user's active intent and shouldn't be lossily summarized).
   * Respects the per-thread compaction cap.
   *
   * Resolves to `true` if a new summary was persisted, `false` if
   * nothing happened (no model, nothing to compact, or cap hit).
   */
  const compactNow = useCallback(async (): Promise<boolean> => {
    if (!threadId || !modelId || compacting) return false;
    const all = messagesRef.current;
    if (all.length === 0) return false;

    const current = await getActiveSummary(threadId);
    const coveredIds = new Set(current?.replacedMessageIds ?? []);

    // Keep the last exchange verbatim (same recency floor as auto). Only
    // messages before the boundary and not already covered are eligible.
    const recencyStart = recencyBoundaryIndex(all, COMPACT_KEEP_EXCHANGES);
    const toCompact: Message[] = [];
    for (let i = 0; i < recencyStart; i++) {
      const m = all[i]!;
      if (coveredIds.has(m.id)) continue;
      toCompact.push(m);
    }
    if (toCompact.length === 0) return false;

    const nextGeneration = (current?.generation ?? 0) + 1;
    if (nextGeneration > MAX_COMPACTIONS_PER_THREAD) {
      console.warn(
        `[compact] cap of ${MAX_COMPACTIONS_PER_THREAD} reached — manual ` +
          'compaction blocked. Start a new chat for the best quality.',
      );
      return false;
    }

    setCompacting(true);
    try {
      const result = await compact(toCompact, provider, modelId, {
        priorSummary: current?.text ?? null,
        contextWindow: params.contextWindow,
        calRatio: getCalibrationRatio(provider.id, modelId),
      });
      if (!result) return false;

      const replacedIds = [
        ...(current?.replacedMessageIds ?? []),
        ...toCompact.map((m) => m.id),
      ];
      const droppedTokens = toCompact.reduce(
        (s, m) => s + estimateMessageTokens(m),
        0,
      );
      const saved = await saveSummary({
        threadId,
        text: result.text,
        replacedMessageIds: replacedIds,
        replacedTokens: (current?.replacedTokens ?? 0) + droppedTokens,
        summaryTokens: estimateStringTokens(result.text, getCalibrationRatio(provider.id, modelId)),
        source: 'manual',
      });
      setActiveSummary(saved);
      return true;
    } finally {
      setCompacting(false);
    }
  }, [threadId, modelId, provider, compacting, params.contextWindow]);

  /**
   * D10b — clear the active summary for the thread. Useful when the
   * user has edited an older message (its content no longer matches
   * what was summarized) or just wants to start fresh without losing
   * the messages themselves.
   */
  const clearSummary = useCallback(async (): Promise<void> => {
    if (!threadId) return;
    await clearActiveSummary(threadId);
    setActiveSummary(null);
  }, [threadId]);

  return {
    messages,
    generating,
    budget,
    activeSummary,
    compacting,
    send,
    regenerate,
    editAndResend,
    stop,
    compactNow,
    clearSummary,
  };
}
