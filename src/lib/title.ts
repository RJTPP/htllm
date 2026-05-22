import type { ChatProvider } from '../providers/types';
import { stripThinking } from './thinking';

/** Hard cap on model-based title generation before falling back to trim. */
const TITLE_TIMEOUT_MS = 10_000;

/**
 * Ask the model for a concise conversation title based on the first message.
 * Returns null on timeout, error, or empty output — the caller is expected
 * to fall back to a trimmed first message.
 */
export async function generateTitle(
  provider: ChatProvider,
  modelId: string,
  firstMessage: string,
): Promise<string | null> {
  if (!modelId) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);
  try {
    const prompt =
      'Generate a short, descriptive title (3 to 6 words) for a chat that ' +
      'starts with the message below. Reply with ONLY the title — no quotes, ' +
      'no trailing punctuation.\n\nMessage:\n' +
      firstMessage.slice(0, 500);

    let out = '';
    for await (const chunk of provider.chat({
      messages: [
        { id: '__title', threadId: '', role: 'user', content: prompt, createdAt: 0 },
      ],
      modelId,
      temperature: 0.3,
      maxTokens: 32,
      reasoningEffort: 'off',
      signal: controller.signal,
    })) {
      out += chunk.delta;
    }
    return cleanTitle(out);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize raw model output into a usable title, or null if unusable. */
function cleanTitle(raw: string): string | null {
  let s = stripThinking(raw).trim();
  s = s.split('\n')[0]?.trim() ?? '';
  s = s.replace(/^["'`*]+|["'`*]+$/g, '').trim();
  s = s.replace(/[.]+$/, '').trim();
  if (!s) return null;
  if (s.length > 60) s = `${s.slice(0, 60).trim()}…`;
  return s;
}
