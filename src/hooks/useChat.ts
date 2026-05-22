import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message, ModelParams, ContentPart } from '../providers/types';
import type { ChatImage } from '../lib/image';
import type { WebLLMProvider } from '../providers/webllm/index';
import {
  addMessage,
  getMessages,
  updateMessage,
} from '../data/messages';

export function useChat(
  provider: WebLLMProvider,
  threadId: string | null,
  params: ModelParams,
  onThreadUpdate?: (threadId: string) => void,
  onAutoTitle?: (threadId: string, firstMessage: string) => void,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messageCountRef = useRef(0);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    getMessages(threadId).then((msgs) => {
      setMessages(msgs);
      messageCountRef.current = msgs.length;
    });
  }, [threadId]);

  const send = useCallback(
    async (text: string, images?: ChatImage[]) => {
      if (!threadId || generating) return;

      const isFirstMessage = messageCountRef.current === 0;

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

      const assistantMsg = await addMessage({
        threadId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      });

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      messageCountRef.current += 2;
      setGenerating(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const allMessages = [...messages, userMsg];
        let fullContent = '';

        for await (const chunk of provider.chat({
          messages: allMessages,
          modelId: provider.getLoadedModelId() ?? '',
          temperature: params.temperature,
          topP: params.topP,
          maxTokens: params.maxTokens,
          presencePenalty: params.presencePenalty,
          frequencyPenalty: params.frequencyPenalty,
          signal: controller.signal,
        })) {
          fullContent += chunk.delta;
          const currentContent = fullContent;
          const currentUsage = chunk.usage;

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
          usage: messages[messages.length - 1]?.usage,
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          const errorContent = `[error] ${err instanceof Error ? err.message : String(err)}`;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...assistantMsg,
              content: errorContent,
            };
            return copy;
          });
          await updateMessage(assistantMsg.id, { content: errorContent });
        }
      } finally {
        setGenerating(false);
        abortRef.current = null;
        onThreadUpdate?.(threadId);

        if (isFirstMessage) {
          onAutoTitle?.(threadId, text);
        }
      }
    },
    [threadId, generating, messages, provider, params, onThreadUpdate, onAutoTitle],
  );

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  return { messages, generating, send, stop };
}
