import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Message,
  ModelParams,
  ContentPart,
  UsageStats,
  ChatProvider,
} from '../providers/types';
import type { ChatImage } from '../lib/image';
import { addMessage, getMessages, updateMessage, deleteMessage } from '../data/messages';

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
      let finalUsage: UsageStats | undefined;

      try {
        const trimmed = params.historyMsgs > 0 ? history.slice(-params.historyMsgs) : history;
        const sysMsg: Message | null = systemPrompt.trim()
          ? {
              id: '__system',
              threadId,
              role: 'system',
              content: systemPrompt,
              createdAt: 0,
            }
          : null;
        const sendMessages = sysMsg ? [sysMsg, ...trimmed] : trimmed;

        for await (const chunk of provider.chat({
          messages: sendMessages,
          modelId,
          temperature: params.temperature,
          topP: params.topP,
          maxTokens: params.maxTokens,
          presencePenalty: params.presencePenalty,
          frequencyPenalty: params.frequencyPenalty,
          signal: controller.signal,
        })) {
          fullContent += chunk.delta;
          if (chunk.usage) finalUsage = chunk.usage;
          const currentContent = fullContent;
          const currentUsage = finalUsage;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...assistantMsg,
              content: currentContent,
              usage: currentUsage,
            };
            return copy;
          });
        }

        await updateMessage(assistantMsg.id, {
          content: fullContent,
          usage: finalUsage,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          await updateMessage(assistantMsg.id, {
            content: fullContent,
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

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, generating, send, regenerate, stop };
}
