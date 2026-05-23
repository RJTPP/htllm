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

/** Accent color preset keys. Persisted under the 'accentColor' setting. */
export type AccentColor = 'amber' | 'soft-amber' | 'cyan' | 'tokyo-blue' | 'violet' | 'emerald';

export interface AccentPreset {
  label: string;
  /** Space-separated RGB channels for CSS variable (e.g. '245 158 11'). */
  rgb: string;
}

export const ACCENT_PRESETS: Record<AccentColor, AccentPreset> = {
  'amber':      { label: 'Amber',      rgb: '245 158 11' },
  'soft-amber': { label: 'Soft Amber', rgb: '217 119 6' },
  'cyan':       { label: 'Cyan',       rgb: '86 207 225' },
  'tokyo-blue': { label: 'Tokyo Blue', rgb: '122 162 247' },
  'violet':     { label: 'Violet',     rgb: '167 139 250' },
  'emerald':    { label: 'Emerald',    rgb: '52 211 153' },
};

export const DEFAULT_ACCENT_COLOR: AccentColor = 'amber';

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
