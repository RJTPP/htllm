import type { ModelParams } from '../providers/types';
import { getDb } from './db';

export const DEFAULT_MODEL_PARAMS: ModelParams = {
  temperature: 1.0,
  topP: 1.0,
  maxTokens: 4000,
  presencePenalty: 0,
  frequencyPenalty: 0,
  contextWindow: 4096,
  historyMsgs: 12,
  reasoningEffort: 'low',
};

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful, concise assistant running locally in the user's browser.";

/** Shiki theme used for code blocks. Persisted under the 'codeTheme' setting. */
export const DEFAULT_CODE_THEME = 'vesper';

/**
 * How new thread titles are derived:
 * - 'trim'     — slice of the first user message (instant, offline)
 * - 'generate' — ask the model for a concise title, falling back to trim
 */
export type TitleMode = 'trim' | 'generate';

/** Persisted under the 'titleMode' setting. */
export const DEFAULT_TITLE_MODE: TitleMode = 'trim';

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const entry = await db.get('settings', key);
  return entry?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key, value });
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const db = await getDb();
  const entries = await db.getAll('settings');
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    result[entry.key] = entry.value;
  }
  return result;
}
