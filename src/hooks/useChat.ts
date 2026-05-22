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

export function useChat(
  provider: ChatProvider,
  modelId: string,
  threadId: string | null,
  params: ModelParams,
  systemPrompt: string,
  onThreadUpdate?: (threadId: string) => void,
  onAutoTitle?: (threadId: string, firstMessage: string) => void,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    getMessages(threadId).then(setMessages);
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

        const sysMsg: Message | null = systemPrompt.trim()
          ? {
              id: '__system',
              threadId,
              role: 'system',
              content: systemPrompt,
              createdAt: 0,
            }
          : null;
        const sendMessages = sysMsg ? [sysMsg, ...cleaned] : cleaned;

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
          const currentContent = fullContent;
          const currentReasoning = fullReasoning;
          const currentUsage = finalUsage;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...assistantMsg,
              content: currentContent,
              reasoning: currentReasoning || undefined,
              usage: currentUsage,
            };
            return copy;
          });
        }

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
    [threadId, modelId, params, systemPrompt, provider, onThreadUpdate],
  );

  const send = useCallback(
    async (text: string, images?: ChatImage[]) => {
      if (!threadId || generating) return;

      const isFirstMessage = messages.length === 0;

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

      await runGeneration([...messages, userMsg]);

      if (isFirstMessage) {
        onAutoTitle?.(threadId, text);
      }
    },
    [threadId, generating, messages, runGeneration, onAutoTitle],
  );

  const regenerate = useCallback(async () => {
    if (!threadId || generating) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;

    await deleteMessage(last.id);
    const trimmed = messages.slice(0, -1);
    setMessages(trimmed);

    await runGeneration(trimmed);
  }, [threadId, generating, messages, runGeneration]);

  /** Edit a user message and re-generate from that point (truncate-and-replace). */
  const editAndResend = useCallback(
    async (messageId: string, newText: string) => {
      if (!threadId || generating) return;

      // Find the target message.
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = messages[idx]!;
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
      const kept = messages.filter(
        (_m, i) => i <= idx && !deletedIds.includes(_m.id),
      );
      const editedMsg: Message = { ...target, content: newContent };
      kept[kept.length - 1] = editedMsg;
      setMessages(kept);

      // Re-generate from the updated history.
      await runGeneration(kept);
    },
    [threadId, generating, messages, runGeneration],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, generating, send, regenerate, editAndResend, stop };
}
