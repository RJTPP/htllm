import type { ChatProvider } from './types';
import { WebLLMProvider } from './webllm/index';
import { openaiCompatProvider } from './openai-compat/index';

const providers: ChatProvider[] = [new WebLLMProvider(), openaiCompatProvider];

export function getProviders(): ChatProvider[] {
  return providers;
}

export function getDefaultProvider(): ChatProvider {
  return providers[0]!;
}
