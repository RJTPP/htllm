import type {
  WebWorkerMLCEngine,
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from '@mlc-ai/web-llm';
import type {
  ChatProvider,
  ChatParams,
  ChatChunk,
  ModelInfo,
  LoadProgress,
  EngineStatus,
  ContentPart,
} from '../types';
import { ProviderError } from '../../lib/errors';
import { getModelList } from './model-list';

function toOpenAIMessage(
  role: 'user' | 'assistant' | 'system',
  content: string | ContentPart[],
): ChatCompletionMessageParam {
  if (typeof content === 'string') {
    return { role, content } as ChatCompletionMessageParam;
  }
  const parts: ChatCompletionContentPart[] = content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    return { type: 'image_url', image_url: { url: part.image_url.url } };
  });
  return { role: 'user', content: parts } as ChatCompletionMessageParam;
}

export class WebLLMProvider implements ChatProvider {
  readonly id = 'webllm';
  readonly displayName = 'WebLLM (In-Browser)';
  readonly authMode = 'none' as const;
  readonly needsModelLoad = true;
  readonly capabilities = {
    streaming: true,
    toolCalls: false,
    vision: true,
  };

  private engine: WebWorkerMLCEngine | null = null;
  private worker: Worker | null = null;
  private loadedModelId: string | null = null;
  private status: EngineStatus = 'idle';

  async listModels(): Promise<ModelInfo[]> {
    return getModelList();
  }

  getLoadedModelId(): string | null {
    return this.loadedModelId;
  }

  getEngineStatus(): EngineStatus {
    return this.status;
  }

  async loadModel(
    modelId: string,
    onProgress: (report: LoadProgress) => void,
    contextWindow?: number,
  ): Promise<void> {
    this.status = 'loading';

    if (this.engine) {
      try {
        await this.engine.unload();
      } catch {
        // ignore unload errors
      }
      this.loadedModelId = null;
    }

    if (!this.worker) {
      this.worker = new Worker(
        new URL('../../workers/webllm-worker.ts', import.meta.url),
        { type: 'module' },
      );
    }

    const { WebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
    this.engine = new WebWorkerMLCEngine(this.worker);
    this.engine.setInitProgressCallback((report) => {
      onProgress({
        progress: report.progress,
        text: report.text,
        timeElapsed: report.timeElapsed,
      });
    });

    try {
      await this.engine.reload(
        modelId,
        contextWindow ? { context_window_size: contextWindow } : undefined,
      );
      this.loadedModelId = modelId;
      this.status = 'ready';
    } catch (err) {
      this.status = 'error';
      throw new ProviderError('webllm', `Failed to load model: ${String(err)}`, err);
    }
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    if (!this.engine || this.status !== 'ready') {
      throw new ProviderError('webllm', 'Engine not ready');
    }

    let openaiMessages = params.messages.map((m) => {
      if (m.role === 'tool' || m.toolCalls?.length) throw new ProviderError('webllm', 'Tool calling is not supported by this provider.');
      return toOpenAIMessage(m.role, m.content);
    });

    // For Qwen3 models in WebLLM, thinking mode is controlled via prompt
    // markers. When reasoning is off, prepend /no_think to the last user
    // message so the model skips chain-of-thought.
    const isQwen = params.modelId.toLowerCase().includes('qwen');
    if (isQwen && params.reasoningEffort === 'off') {
      openaiMessages = openaiMessages.map((m, i) => {
        if (i === openaiMessages.length - 1 && m.role === 'user' && typeof m.content === 'string') {
          return { ...m, content: `/no_think\n${m.content}` };
        }
        return m;
      });
    }

    const engine = this.engine;
    const onAbort = () => engine.interruptGenerate();
    params.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const stream = await this.engine.chat.completions.create({
        messages: openaiMessages,
        stream: true,
        temperature: params.temperature,
        top_p: params.topP,
        max_tokens: params.maxTokens,
        presence_penalty: params.presencePenalty,
        frequency_penalty: params.frequencyPenalty,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        if (params.signal?.aborted) break;

        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content ?? '';
        const finishReason = choice?.finish_reason as ChatChunk['finishReason'] | null;

        const chatChunk: ChatChunk = { delta };
        if (finishReason) {
          chatChunk.finishReason = finishReason;
        }
        if (chunk.usage) {
          chatChunk.usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            prefillTokensPerSecond: chunk.usage.extra?.prefill_tokens_per_s,
            decodeTokensPerSecond: chunk.usage.extra?.decode_tokens_per_s,
          };
        }

        yield chatChunk;
      }
    } finally {
      params.signal?.removeEventListener('abort', onAbort);
    }
  }

  async unload(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch {
        // ignore
      }
      this.engine = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.loadedModelId = null;
    this.status = 'idle';
  }

  async evictModel(modelId: string): Promise<void> {
    if (modelId === this.loadedModelId) {
      await this.unload();
    }
    const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
    await deleteModelAllInfoInCache(modelId);
  }
}
