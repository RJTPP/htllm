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
import { compact, formatSummaryBlock, formatTailBlock } from '../lib/compact';
import { getActiveSummaries, saveSummary } from '../data/summaries';
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
  /** Estimated tokens of the system message (persona + RAG + summary). */
  systemTokens: number;
  /** Estimated tokens of the verbatim conversation tail being sent. */
  conversationTokens: number;
  /** Id of the oldest message actually sent verbatim. Messages above it
   *  that aren't covered by a summary were trimmed (drop mode only) —
   *  drives the inline trim divider. Null when nothing was kept. */
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
  const [historySummary, setHistorySummary] = useState<
    import('../providers/types').ConversationSummary | null
  >(null);
  const [tailSummary, setTailSummary] = useState<
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

  // D10b — load both active summaries whenever the thread changes. They
  // live in the system prompt at send time and on the inline dividers in
  // the message list. Null when no compaction of that kind has run.
  useEffect(() => {
    if (!threadId) {
      setHistorySummary(null);
      setTailSummary(null);
      return;
    }
    let cancelled = false;
    getActiveSummaries(threadId).then(({ history, tail }) => {
      if (!cancelled) {
        setHistorySummary(history);
        setTailSummary(tail);
      }
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
    // Exclude messages already covered by either summary — they're
    // represented by a summary block in the system prompt, not by their
    // own rows in the conversation tail.
    const coveredIds = new Set([
      ...(historySummary?.replacedMessageIds ?? []),
      ...(tailSummary?.replacedMessageIds ?? []),
    ]);
    const candidates = coveredIds.size
      ? messages.filter((m) => !coveredIds.has(m.id))
      : messages;
    const calRatio = getCalibrationRatio(provider.id, modelId);
    const historyBlock = historySummary
      ? formatSummaryBlock(historySummary.text)
      : '';
    const tailBlock = tailSummary ? formatTailBlock(tailSummary.text) : '';
    const sysParts = [historyBlock, tailBlock, systemPrompt.trim()].filter(Boolean);
    const sysText = sysParts.join('\n\n');
    const sysTokens = sysText ? estimateStringTokens(sysText, calRatio) + 4 : 0;
    // Pre-send estimate for the meter — the full tail (no trim); the
    // meter going past the trigger is the signal that a send will
    // compact. firstSentMessageId is only meaningful post-send (drop
    // mode's trim divider), so leave it null here.
    setBudget({
      contextWindow: params.contextWindow,
      systemTokens: sysTokens,
      conversationTokens: estimateMessagesTokens(candidates, calRatio),
      firstSentMessageId: null,
    });
  }, [
    threadId,
    messages,
    params.contextWindow,
    params.maxTokens,
    systemPrompt,
    historySummary,
    tailSummary,
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
    async (history: Message[], opts: { skipCompaction?: boolean } = {}) => {
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
        // D10b — load both active summaries for this thread (if any).
        // 'history' covers older turns; 'tail' covers a recent oversized
        // exchange summarized into its own block. We filter the union of
        // their covered ids out of `history` so those messages aren't
        // doubly represented (a covered row AND a summary block).
        const { history: histRec, tail: tailRec } = threadId
          ? await getActiveSummaries(threadId)
          : { history: null, tail: null };
        const loadedCovered = new Set([
          ...(histRec?.replacedMessageIds ?? []),
          ...(tailRec?.replacedMessageIds ?? []),
        ]);
        const trimmed = loadedCovered.size
          ? history.filter((m) => !loadedCovered.has(m.id))
          : history;

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
        // above the history <summary> block (older turns compacted), then
        // the separate tail <recent-context> block (a recent oversized
        // exchange), then the persona prompt so model-side instructions
        // still have the last word.
        let historyText = histRec?.text ?? '';
        let tailText = tailRec?.text ?? '';
        const buildSysContent = () => {
          const historyBlock = historyText ? formatSummaryBlock(historyText) : '';
          const tailBlock = tailText ? formatTailBlock(tailText) : '';
          return [ragBlock, historyBlock, tailBlock, systemPrompt.trim()]
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

        // Mutable compaction bookkeeping. `cleaned` already excludes
        // messages covered by the loaded summaries. `newlyCovered` tracks
        // ids summarized during THIS send (history prefix and/or tail
        // exchange); the verbatim send-set is `cleaned` minus that set.
        const newlyCovered = new Set<string>();
        let histReplacedIds = histRec?.replacedMessageIds ?? [];
        let histReplacedTokens = histRec?.replacedTokens ?? 0;
        let histGeneration = histRec?.generation ?? 0;
        let tailReplacedIds = tailRec?.replacedMessageIds ?? [];
        let tailReplacedTokens = tailRec?.replacedTokens ?? 0;
        let tailGeneration = tailRec?.generation ?? 0;

        // Messages still sent verbatim, and their estimated tokens.
        const verbatim = () => cleaned.filter((m) => !newlyCovered.has(m.id));
        const verbatimTokens = () =>
          estimateMessagesTokens(verbatim(), calRatio);

        const rebuildSys = () => {
          sysContent = buildSysContent();
          sysMsg = sysContent
            ? { id: '__system', threadId, role: 'system', content: sysContent, createdAt: 0 }
            : null;
          sysTokens = sysMsg ? estimateMessageTokens(sysMsg, calRatio) : 0;
          conversationBudget = Math.max(
            0,
            params.contextWindow - responseReserve - sysTokens,
          );
        };

        // Summarize `slice` into the summary of `kind`, persist, mark its
        // ids covered, and rebuild the system message. 'history' and
        // 'tail' are tracked independently and each cumulative (the prior
        // summary of the same kind is fed back). Returns true on success.
        const compactSlice = async (
          slice: Message[],
          kind: 'history' | 'tail',
        ): Promise<boolean> => {
          if (slice.length === 0) return false;
          const tokens = slice.reduce(
            (s, m) => s + estimateMessageTokens(m, calRatio),
            0,
          );
          // Don't burn an LLM call summarizing a sliver.
          if (tokens < COMPACT_MIN_ELIGIBLE_TOKENS) return false;

          const isTail = kind === 'tail';
          const nextGeneration = (isTail ? tailGeneration : histGeneration) + 1;
          if (nextGeneration > MAX_COMPACTIONS_PER_THREAD) {
            console.warn(
              `[compact] cap of ${MAX_COMPACTIONS_PER_THREAD} ${kind} ` +
                'compactions reached — leaving context as-is. Consider ' +
                'starting a new chat for the best quality.',
            );
            return false;
          }
          if (nextGeneration === WARN_COMPACTIONS_PER_THREAD) {
            console.warn(
              `[compact] approaching the cap of ${MAX_COMPACTIONS_PER_THREAD} ` +
                `${kind} compactions — quality degrades with each round.`,
            );
          }

          setCompacting(true);
          try {
            const result = await compact(slice, provider, modelId, {
              priorSummary: (isTail ? tailText : historyText) || null,
              signal: controller.signal,
              contextWindow: params.contextWindow,
            });
            if (!result) return false;
            const ids = slice.map((m) => m.id);
            for (const id of ids) newlyCovered.add(id);
            const summaryTokens = estimateStringTokens(result.text, calRatio);
            if (isTail) {
              tailReplacedIds = [...tailReplacedIds, ...ids];
              tailReplacedTokens += tokens;
              const saved = await saveSummary({
                threadId: threadId!,
                kind: 'tail',
                text: result.text,
                replacedMessageIds: tailReplacedIds,
                replacedTokens: tailReplacedTokens,
                summaryTokens,
                source: 'auto',
              });
              setTailSummary(saved);
              tailGeneration = saved.generation;
              tailText = result.text;
            } else {
              histReplacedIds = [...histReplacedIds, ...ids];
              histReplacedTokens += tokens;
              const saved = await saveSummary({
                threadId: threadId!,
                kind: 'history',
                text: result.text,
                replacedMessageIds: histReplacedIds,
                replacedTokens: histReplacedTokens,
                summaryTokens,
                source: 'auto',
              });
              setHistorySummary(saved);
              histGeneration = saved.generation;
              historyText = result.text;
            }
            rebuildSys();
            return true;
          } finally {
            setCompacting(false);
          }
        };

        // D10b — compression handling. Modes:
        //   'off'  → send everything; backend is the real limit.
        //   'drop' → trim oldest to fit the budget (the explicit "lose
        //            old context" choice).
        //   'auto' → at/above the floor: two independent triggers (history
        //            + last-turn), then send as-is. Below the floor
        //            compaction can't run, so trim to fit instead.
        if (compressionMode === 'auto' && !opts.skipCompaction) {
          // skipCompaction (regenerate / edit-resend) reuses the existing
          // summaries as-is — re-rolling the same turn shouldn't spend
          // another summarize call or change the context.
          const triggerAt = COMPACT_TRIGGER_FRACTION * params.contextWindow;
          if (
            sysTokens + verbatimTokens() > triggerAt &&
            params.contextWindow >= MIN_AUTO_COMPACT_CONTEXT_TOKENS
          ) {
            // recencyBoundaryIndex keeps the last completed exchange (+ the
            // pending user turn) verbatim; `boundary` is that exchange's
            // start index.
            const boundary = recencyBoundaryIndex(cleaned, COMPACT_KEEP_EXCHANGES);

            // Trigger 1 — history: summarize everything BEFORE the last
            // completed exchange into the history <summary> block.
            if (boundary > 0) await compactSlice(cleaned.slice(0, boundary), 'history');

            // Trigger 2 — last turn: if the last completed exchange is
            // ITSELF large enough that the verbatim tail is still over the
            // threshold, summarize that exchange specifically into the
            // SEPARATE tail block and drop its verbatim form — keeping only
            // the pending user query verbatim. (Independent path: it never
            // merges into the history <summary>.)
            if (sysTokens + verbatimTokens() > triggerAt) {
              let pendingUserIdx = -1;
              for (let i = cleaned.length - 1; i >= 0; i--) {
                if (cleaned[i]!.role === 'user') {
                  pendingUserIdx = i;
                  break;
                }
              }
              if (pendingUserIdx > boundary) {
                await compactSlice(cleaned.slice(boundary, pendingUserIdx), 'tail');
              }
            }
          }
        }

        // Decide the send-set. 'drop' always trims; 'auto' trims only when
        // the window is below the compaction floor (where the proactive
        // pass can't run) — trimming to fit beats a silent overflow there.
        // Otherwise (auto above the floor, or 'off') send the
        // (post-compaction) tail as-is.
        const tail = verbatim();
        const trimToFit =
          compressionMode === 'drop' ||
          (compressionMode === 'auto' &&
            params.contextWindow < MIN_AUTO_COMPACT_CONTEXT_TOKENS);
        let fit: import('../lib/conversation-budget').FitResult;
        if (trimToFit) {
          fit = fitToBudget(tail, conversationBudget, calRatio);
        } else {
          fit = {
            kept: tail,
            dropped: [],
            keptTokens: estimateMessagesTokens(tail, calRatio),
            droppedTokens: 0,
            singleMessageOverflow:
              tail.length <= 1 && sysTokens + verbatimTokens() > params.contextWindow,
          };
        }

        if (fit.singleMessageOverflow) {
          console.warn(
            '[chat] prompt exceeds the context window on its own — the ' +
              'provider may error. Increase contextWindow or shorten the message.',
            { window: params.contextWindow, used: sysTokens + fit.keptTokens },
          );
        }
        if (fit.dropped.length > 0) {
          console.debug(
            `[chat] drop mode trimmed ${fit.dropped.length} message(s) ` +
              `(${fit.droppedTokens} tokens) to fit the budget.`,
          );
        }
        const sendMessages = sysMsg ? [sysMsg, ...fit.kept] : fit.kept;

        // Surface the latest budget snapshot to consumers (token meter
        // in the chat header reads from here). Estimates only — never
        // exact, but accurate enough for the 50/75/90% color tiers.
        setBudget({
          contextWindow: params.contextWindow,
          systemTokens: sysTokens,
          conversationTokens: fit.keptTokens,
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

        // Refine this model's token calibration from the GENERATED
        // output. completionTokens is the full real count (output isn't
        // cached, unlike prompt tokens) and shares the tokenizer, so its
        // chars/token bias applies to prompt estimation too. Compare it
        // to a raw (ratio=1) estimate of everything generated — visible
        // content plus any reasoning, since completionTokens counts both.
        // Fire-and-forget; short / missing samples are dropped inside.
        if (finalUsage?.completionTokens) {
          const generated = fullReasoning
            ? `${fullReasoning}\n${fullContent}`
            : fullContent;
          void recordCalibrationSample(
            provider.id,
            modelId,
            estimateStringTokens(generated, 1),
            finalUsage.completionTokens,
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

    await runGeneration(trimmed, { skipCompaction: true });
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

      // Re-generate from the updated history. Skip compaction — editing
      // re-rolls from this point and should reuse the existing summary.
      await runGeneration(kept, { skipCompaction: true });
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
    if (!threadId) {
      console.warn('[compact] manual: no active thread');
      return false;
    }
    if (!modelId) {
      console.warn('[compact] manual: no chat model loaded');
      return false;
    }
    if (compacting) {
      console.warn('[compact] manual: a compaction is already running');
      return false;
    }
    const all = messagesRef.current;
    if (all.length === 0) return false;

    const { history: current, tail: tailCur } = await getActiveSummaries(threadId);
    const coveredIds = new Set([
      ...(current?.replacedMessageIds ?? []),
      ...(tailCur?.replacedMessageIds ?? []),
    ]);

    // Manual compaction is AGGRESSIVE — keep only the single most recent
    // message verbatim and fold everything before it that isn't already
    // covered (by either summary) into the history block. (Auto keeps a
    // whole exchange; manual is an explicit "free space now", and keeping
    // just the last message means /compact still has work to do even
    // after auto already ran.)
    const recencyStart = all.length - 1;
    const toCompact: Message[] = [];
    for (let i = 0; i < recencyStart; i++) {
      const m = all[i]!;
      if (coveredIds.has(m.id)) continue;
      toCompact.push(m);
    }
    if (toCompact.length === 0) {
      console.warn(
        '[compact] manual: nothing left to compact (only the latest ' +
          'message is uncovered).',
      );
      return false;
    }

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
        kind: 'history',
        text: result.text,
        replacedMessageIds: replacedIds,
        replacedTokens: (current?.replacedTokens ?? 0) + droppedTokens,
        summaryTokens: estimateStringTokens(result.text, getCalibrationRatio(provider.id, modelId)),
        source: 'manual',
      });
      setHistorySummary(saved);
      return true;
    } finally {
      setCompacting(false);
    }
  }, [threadId, modelId, provider, compacting, params.contextWindow]);

  return {
    messages,
    generating,
    budget,
    historySummary,
    tailSummary,
    compacting,
    send,
    regenerate,
    editAndResend,
    stop,
    compactNow,
  };
}
