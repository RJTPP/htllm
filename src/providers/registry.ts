import type { ChatProvider, EmbeddingProvider } from './types';
import { WebLLMProvider } from './webllm/index';
import { OpenAICompatibleProvider, type HttpProviderSpec } from './openai-compat/index';

export const WEBLLM_ID = 'webllm';
export const OPENAI_COMPAT_ID = 'openai-compat';
export const OLLAMA_ID = 'ollama';
export const LMSTUDIO_ID = 'lmstudio';

// One spec per OpenAI-compatible HTTP endpoint. Adding another endpoint —
// or, later, user-defined BYOK entries — is just another record here.
const HTTP_SPECS: HttpProviderSpec[] = [
  {
    id: OPENAI_COMPAT_ID,
    displayName: 'OpenAI-compatible API',
    defaultBaseURL: '',
    usesKey: true,
    offDevice: true,
    description:
      'Any /v1/chat/completions endpoint — Groq, OpenRouter, Together or a custom server.',
    corsNote:
      'The endpoint must send permissive CORS headers. api.openai.com does not — use a CORS-friendly endpoint such as Groq or OpenRouter.',
  },
  {
    id: OLLAMA_ID,
    displayName: 'Ollama',
    defaultBaseURL: 'http://localhost:11434/v1',
    usesKey: false,
    offDevice: false,
    description: 'Ollama HTTP endpoint. Inference runs wherever the configured server routes it.',
    corsNote:
      'To allow browser access, start Ollama with OLLAMA_ORIGINS set — e.g. OLLAMA_ORIGINS=* ollama serve.',
  },
  {
    id: LMSTUDIO_ID,
    displayName: 'LM Studio',
    defaultBaseURL: 'http://localhost:1234/v1',
    usesKey: false,
    offDevice: false,
    description: 'LM Studio HTTP endpoint. A local endpoint may proxy inference to another machine.',
    corsNote:
      'To allow browser access, run the LM Studio local server with its CORS toggle enabled in server settings.',
  },
];

const webllmProvider = new WebLLMProvider();
const httpProviders = HTTP_SPECS.map((spec) => new OpenAICompatibleProvider(spec));
const allProviders: ChatProvider[] = [webllmProvider, ...httpProviders];
const byId = new Map<string, ChatProvider>(allProviders.map((p) => [p.id, p]));

export function getProvider(id: string): ChatProvider | undefined {
  return byId.get(id);
}

export function getWebLLMProvider(): WebLLMProvider {
  return webllmProvider;
}

export function getHttpProviders(): OpenAICompatibleProvider[] {
  return httpProviders;
}

export function getAllProviders(): ChatProvider[] {
  return allProviders;
}

/**
 * Embedding-capable providers. Currently all HTTP providers implement
 * EmbeddingProvider (via /v1/embeddings); WebLLM doesn't, so we cast the
 * subset rather than the whole registry.
 */
export function getEmbeddingProviders(): EmbeddingProvider[] {
  return httpProviders;
}

export function getEmbeddingProvider(id: string): EmbeddingProvider | undefined {
  return httpProviders.find((p) => p.id === id);
}
