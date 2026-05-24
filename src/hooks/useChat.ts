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

export function useChat(
  provider: ChatProvider,
  modelId: string,
  threadId: string | null,
  params: ModelParams,
  systemPrompt: string,
  onThreadUpdate?: (threadId: string) => void,
  onAutoTitle?: (threadId: string, firstMessage: string) => void,
  rag?: RagConfig,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Ref keeps the latest messages accessible from callbacks without adding
  // `messages` to their dependency arrays (which would destabilize them).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Abort any in-flight stream on unmount to prevent stale setState calls.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

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
        const trimmed = params.historyMsgs > 0 ? history.slice(-params.historyMsgs) : history;

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
        // above the persona prompt so model-side instructions still have
        // the last word.
        const sysContent = [ragBlock, systemPrompt.trim()].filter(Boolean).join('\n');
        const sysMsg: Message | null = sysContent
          ? {
              id: '__system',
              threadId,
              role: 'system',
              content: sysContent,
              createdAt: 0,
            }
          : null;
        const sendMessages = sysMsg ? [sysMsg, ...cleaned] : cleaned;

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

  return { messages, generating, send, regenerate, editAndResend, stop };
}
