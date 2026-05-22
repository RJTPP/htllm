/**
 * Lazy-loaded Shiki highlighter singleton.
 *
 * Uses the main `shiki` entry. A small set of common languages is preloaded
 * for instant first-paint; any other bundled grammar — and any theme — is
 * fetched on demand the first time it is used (no hardcoded whitelist).
 *
 * Callers get an escaped-plain-text fallback until the highlighter is ready,
 * and a themed-but-unhighlighted block while an on-demand grammar loads.
 * Subscribers are notified on init, on every on-demand grammar load, and on
 * theme changes so the UI can re-render and upgrade the block.
 */

import type { BundledLanguage, BundledTheme, HighlighterGeneric } from 'shiki';

/** Curated set of dark themes offered in the theme selector. */
export const CODE_THEMES: { id: string; label: string }[] = [
  { id: 'vesper', label: 'Vesper' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha' },
  { id: 'github-dark', label: 'GitHub Dark' },
  { id: 'gruvbox-dark-hard', label: 'Gruvbox Dark' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'tokyo-night', label: 'Tokyo Night' },
  { id: 'one-dark-pro', label: 'One Dark Pro' },
  { id: 'night-owl', label: 'Night Owl' },
  { id: 'nord', label: 'Nord' },
  { id: 'dracula', label: 'Dracula' },
];

/** Default theme — kept in sync with DEFAULT_CODE_THEME in data/settings.ts. */
const DEFAULT_THEME = 'vesper';

/** Currently selected theme (mutable; changed via setCodeTheme). */
let currentTheme: string = DEFAULT_THEME;

/** Languages preloaded at init for instant first-paint of common code. */
const PRELOAD: BundledLanguage[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'json',
  'bash',
  'html',
  'css',
  'markdown',
  'diff',
];

let highlighter: HighlighterGeneric<BundledLanguage, BundledTheme> | null = null;

/** All bundled language/theme ids — populated once the shiki module loads. */
let bundledLangSet = new Set<string>();
let bundledThemeSet = new Set<string>();

/** Grammars/themes currently being lazy-loaded, deduped so each loads once. */
const loadingLangs = new Set<string>();
const loadingThemes = new Set<string>();

/** Listeners notified when highlighting capability changes. */
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/**
 * Subscribe to highlighting updates — fires when the highlighter finishes
 * loading, when a new on-demand grammar/theme becomes available, and when the
 * theme changes. Returns an unsubscribe function.
 */
export function subscribeHighlight(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function init(): Promise<void> {
  const shiki = await import('shiki');
  bundledLangSet = new Set(Object.keys(shiki.bundledLanguages));
  bundledThemeSet = new Set(Object.keys(shiki.bundledThemes));
  highlighter = await shiki.createHighlighter({
    themes: [currentTheme],
    langs: PRELOAD,
  });
  notify();
}

/** Kick off loading immediately on import. */
init().catch((err) => {
  // Highlighter failed to load — callers fall back to plain text.
  console.error('[highlight] shiki init failed:', err);
});

/** Language alias map (models often emit these short forms). */
const ALIAS: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rs: 'rust',
  golang: 'go',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
};

/** Fetch a bundled grammar on demand, then notify subscribers. */
function ensureLanguage(lang: string): void {
  if (!highlighter) return;
  if (loadingLangs.has(lang)) return;
  if (highlighter.getLoadedLanguages().includes(lang)) return;
  if (!bundledLangSet.has(lang)) return; // not a real shiki language

  loadingLangs.add(lang);
  highlighter
    .loadLanguage(lang as BundledLanguage)
    .then(() => {
      loadingLangs.delete(lang);
      notify();
    })
    .catch(() => {
      loadingLangs.delete(lang);
    });
}

/** Fetch a bundled theme on demand, then notify subscribers. */
function ensureTheme(theme: string): void {
  if (!highlighter) return;
  if (loadingThemes.has(theme)) return;
  if (highlighter.getLoadedThemes().includes(theme)) return;
  if (!bundledThemeSet.has(theme)) return; // not a real shiki theme

  loadingThemes.add(theme);
  highlighter
    .loadTheme(theme as BundledTheme)
    .then(() => {
      loadingThemes.delete(theme);
      notify();
    })
    .catch(() => {
      loadingThemes.delete(theme);
    });
}

/**
 * Resolve the theme to actually render with. If the selected theme isn't
 * loaded yet, kick off a load and fall back to any loaded theme meanwhile.
 */
function activeTheme(): BundledTheme {
  if (!highlighter) return currentTheme as BundledTheme;
  const loaded = highlighter.getLoadedThemes();
  if (loaded.includes(currentTheme as BundledTheme)) {
    return currentTheme as BundledTheme;
  }
  ensureTheme(currentTheme);
  return (loaded[0] as BundledTheme) ?? (currentTheme as BundledTheme);
}

/**
 * Switch the active code theme. Loads the grammar on demand if needed and
 * notifies subscribers so existing code blocks re-render. Safe to call before
 * the highlighter has loaded — the theme is applied once it's ready.
 */
export function setCodeTheme(theme: string): void {
  currentTheme = theme;
  ensureTheme(theme);
  notify();
}

/**
 * Highlight a code string and return an HTML string.
 * - Before the highlighter loads: escaped plain text.
 * - For an unloaded bundled language: kicks off an on-demand load and returns
 *   a themed plain-text block in the meantime (upgraded on the next render).
 */
export function highlightToHtml(code: string, langRaw?: string): string {
  const raw = (langRaw ?? '').trim().toLowerCase();
  const lang = ALIAS[raw] ?? raw;

  if (!highlighter) return escapeHtml(code);

  const theme = activeTheme();

  if (lang && lang !== 'text' && lang !== 'plaintext' && lang !== 'txt') {
    if (highlighter.getLoadedLanguages().includes(lang)) {
      return highlighter.codeToHtml(code, { lang, theme });
    }
    if (bundledLangSet.has(lang)) {
      ensureLanguage(lang); // upgrades on the next render
    }
  }

  // Themed plain-text block: no grammar, but keeps the editor look.
  return highlighter.codeToHtml(code, { lang: 'text', theme });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
