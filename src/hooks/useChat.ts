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
  reserveForResponse,
  sliceByUserTurns,
} from '../lib/conversation-budget';
import { estimateMessageTokens, estimateStringTokens } from '../lib/tokens';
import { compact, formatSummaryBlock } from '../lib/compact';
import {
  clearActiveSummary,
  getActiveSummary,
  saveSummary,
} from '../data/summaries';
import {
  type CompressionMode,
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
    const responseReserve = reserveForResponse(
      params.contextWindow,
      params.maxTokens,
    );
    const summaryBlock = activeSummary
      ? formatSummaryBlock(activeSummary.text)
      : '';
    const sysParts = [summaryBlock, systemPrompt.trim()].filter(Boolean);
    const sysText = sysParts.join('\n\n');
    const sysTokens = sysText ? estimateStringTokens(sysText) + 4 : 0;
    const summaryTokens = summaryBlock
      ? estimateStringTokens(summaryBlock)
      : 0;
    const conversationBudget = Math.max(
      0,
      params.contextWindow - responseReserve - sysTokens,
    );
    const fit = fitToBudget(trimmed, conversationBudget);
    setBudget({
      contextWindow: params.contextWindow,
      systemTokens: sysTokens,
      conversationTokens: fit.keptTokens,
      droppedTokens: fit.droppedTokens,
      droppedCount: fit.dropped.length,
      responseReserve,
      summaryTokens,
      summarizedCount: activeSummary?.replacedMessageIds.length ?? 0,
    });
  }, [
    threadId,
    messages,
    params.historyMsgs,
    params.contextWindow,
    params.maxTokens,
    systemPrompt,
    activeSummary,
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
        let sysTokens = sysMsg ? estimateMessageTokens(sysMsg) : 0;
        let conversationBudget = Math.max(
          0,
          params.contextWindow - responseReserve - sysTokens,
        );
        let fit = fitToBudget(cleaned, conversationBudget);

        // D10b — compression handling. Modes:
        //   'off'  → if overflow, throw clearly. No silent drops, no LLM.
        //   'drop' → D10a behavior; fit.kept is what we send, dropped is gone.
        //   'auto' → summarize the dropped portion (plus any prior summary
        //            it should replace), persist, rebuild sysContent with
        //            the new summary, re-fit.
        if (compressionMode === 'off' && fit.dropped.length > 0) {
          throw new Error(
            `Context exceeded by ${fit.dropped.length} message(s) ` +
              `(~${fit.droppedTokens} tokens). Compression is off — ` +
              'increase the context window, lower history, or switch ' +
              'Compression to auto/drop in Settings.',
          );
        }
        if (
          compressionMode === 'auto' &&
          fit.dropped.length > 0 &&
          params.contextWindow >= MIN_AUTO_COMPACT_CONTEXT_TOKENS
        ) {
          const nextGeneration = (currentSummary?.generation ?? 0) + 1;
          if (nextGeneration > MAX_COMPACTIONS_PER_THREAD) {
            console.warn(
              `[compact] cap of ${MAX_COMPACTIONS_PER_THREAD} compactions ` +
                'reached for this thread — falling back to drop. Consider ' +
                'starting a new chat for the best quality.',
            );
          } else if (
            // Only worth compacting if the summary will actually save
            // tokens vs the cost of the summary block (~800 tokens cap
            // on summary length, plus a small safety margin).
            fit.droppedTokens > 1000
          ) {
            if (nextGeneration === WARN_COMPACTIONS_PER_THREAD) {
              console.warn(
                `[compact] approaching the cap of ${MAX_COMPACTIONS_PER_THREAD} ` +
                  'compactions for this thread — quality degrades with each round.',
              );
            }
            setCompacting(true);
            try {
              const result = await compact(fit.dropped, provider, modelId, {
                priorSummary: summaryText || null,
                signal: controller.signal,
              });
              if (result) {
                const replacedIds = [
                  ...(currentSummary?.replacedMessageIds ?? []),
                  ...fit.dropped.map((m) => m.id),
                ];
                const replacedTokens =
                  (currentSummary?.replacedTokens ?? 0) + fit.droppedTokens;
                const saved = await saveSummary({
                  threadId: threadId!,
                  text: result.text,
                  replacedMessageIds: replacedIds,
                  replacedTokens,
                  summaryTokens: estimateStringTokens(result.text),
                  source: 'auto',
                });
                setActiveSummary(saved);

                // Re-build sysContent + re-fit with the new summary.
                // fit.kept usually grows since the summary block is
                // typically smaller than the messages it replaced.
                summaryText = result.text;
                sysContent = buildSysContent();
                sysMsg = sysContent
                  ? {
                      id: '__system',
                      threadId,
                      role: 'system',
                      content: sysContent,
                      createdAt: 0,
                    }
                  : null;
                sysTokens = sysMsg ? estimateMessageTokens(sysMsg) : 0;
                conversationBudget = Math.max(
                  0,
                  params.contextWindow - responseReserve - sysTokens,
                );
                fit = fitToBudget(cleaned, conversationBudget);
              }
            } finally {
              setCompacting(false);
            }
          }
        }

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
          ? estimateStringTokens(finalSummaryBlock)
          : 0;
        setBudget({
          contextWindow: params.contextWindow,
          systemTokens: sysTokens,
          conversationTokens: fit.keptTokens,
          droppedTokens: fit.droppedTokens,
          droppedCount: fit.dropped.length,
          responseReserve,
          summaryTokens: finalSummaryTokens,
          summarizedCount: (currentSummary?.replacedMessageIds.length ?? 0) +
            (summaryText !== (currentSummary?.text ?? '')
              ? fit.dropped.length
              : 0),
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

        for await (const chunk of provider.chat({
          messages: sendMessages,
          modelId,
          temperature: params.temperature,
          topP: params.topP,
          maxTokens: params.maxTokens,
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

    // Keep the latest user turn (and any assistant messages that
    // follow it) verbatim — never summarize the active exchange.
    let recencyStart = all.length;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i]!.role === 'user') {
        recencyStart = i;
        break;
      }
    }

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
        summaryTokens: estimateStringTokens(result.text),
        source: 'manual',
      });
      setActiveSummary(saved);
      return true;
    } finally {
      setCompacting(false);
    }
  }, [threadId, modelId, provider, compacting]);

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
