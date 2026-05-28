import type { ModelParams } from '../providers/types';
import { getDb } from './db';

export const DEFAULT_MODEL_PARAMS: ModelParams = {
  temperature: 1.0,
  topP: 1.0,
  maxTokens: 8192,
  presencePenalty: 0,
  frequencyPenalty: 0,
  contextWindow: 8192,
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
export type AccentColor = 'amber' | 'soft-amber' | 'cyan' | 'tokyo-blue' | 'violet' | 'emerald' | 'rose' | 'gray';

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
  'rose':       { label: 'Rose',       rgb: '244 63 94' },
  'gray':       { label: 'Gray',       rgb: '163 163 163' },
};

export const DEFAULT_ACCENT_COLOR: AccentColor = 'amber';

/**
 * Settings key for the library that new threads inherit as their RAG
 * binding. Optional — unset means new threads start with no library
 * (RAG opt-in per chat). The value is a Library.id (or null when
 * explicitly cleared).
 */
export const DEFAULT_LIBRARY_ID_KEY = 'defaultLibraryId';

/**
 * When true, the per-chat library picker updates defaultLibraryId on
 * every non-null selection — so new chats inherit whatever library the
 * user most recently bound. When false (default), defaultLibraryId is
 * only changed via the explicit picker in Settings → Knowledge.
 *
 * Clearing a chat's library to "None" doesn't update the default; the
 * setting is about which library to *prefer*, not whether RAG is on.
 */
export const REMEMBER_LAST_LIBRARY_KEY = 'rememberLastLibrary';

/**
 * @deprecated Replaced by per-thread libraryId + DEFAULT_LIBRARY_ID_KEY.
 * Kept exported for backwards compat with anything still importing it,
 * but no longer read by the runtime.
 */
export const DEFAULT_RAG_ENABLED = false;

/**
 * D10b — what to do when the sliding window would drop older messages.
 *  - 'auto':  summarize the dropped portion via the active chat model
 *             and inject as a <summary> block. Default.
 *  - 'drop':  silently drop (the D10a baseline behavior). Cheaper,
 *             zero LLM activity, but loses the dropped content.
 *  - 'off':   neither summarize nor drop — let the provider error
 *             when the prompt overflows. For users who want zero
 *             surprises and no hidden LLM activity.
 */
export type CompressionMode = 'auto' | 'drop' | 'off';
export const COMPRESSION_MODE_KEY = 'compressionMode';
export const DEFAULT_COMPRESSION_MODE: CompressionMode = 'auto';

/** Minimum context window for auto-compaction to actually run. Below
 *  this the summary floor (2048) plus the generation/reasoning reserve
 *  (~0.4×window, floored at 2048) leave no room to feed the transcript
 *  in, so compaction can't help — auto falls back to trimming to fit for
 *  the request instead. In 'auto' the context_window control is clamped
 *  to this value. */
export const MIN_AUTO_COMPACT_CONTEXT_TOKENS = 8192;

/** Hard cap on re-compactions per thread (warn at 3). Beyond this,
 *  quality decay makes the summary unreliable — recommend new chat. */
export const MAX_COMPACTIONS_PER_THREAD = 5;
export const WARN_COMPACTIONS_PER_THREAD = 3;

/** Auto-compaction fires when estimated input tokens cross this fraction
 *  of the available conversation budget — proactive headroom rather than
 *  waiting for a hard 100% overflow. */
export const COMPACT_TRIGGER_FRACTION = 0.75;


/** Recent exchanges kept verbatim and never summarized. 1 = keep the
 *  last completed user/assistant pair (plus the pending user turn). */
export const COMPACT_KEEP_EXCHANGES = 1;

/** Don't bother compacting unless at least this many tokens are eligible
 *  — crossing the threshold by a sliver isn't worth an LLM call. */
export const COMPACT_MIN_ELIGIBLE_TOKENS = 1000;

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
