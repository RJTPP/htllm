/**
 * Workspace paths are absolute, '/'-separated and normalized: no empty, '.'
 * or '..' segments, no backslashes or control characters, bounded length.
 * Tool code enforces this (D-17); the model's instructions only describe it.
 */
export const WORKSPACE_ROOTS = ['uploads', 'notes', 'library'] as const;
export type WorkspaceRoot = (typeof WORKSPACE_ROOTS)[number];

const MAX_PATH = 512;

export function isWorkspacePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > MAX_PATH || !path.startsWith('/')) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return false;
  const segments = path.slice(1).split('/');
  return segments.length >= 1 && segments.every((s) => s !== '' && s !== '.' && s !== '..');
}

/**
 * Normalize a model-supplied path. Accepts relative paths (resolved under
 * `defaultRoot`), trims a trailing slash, collapses '//' and '.' segments, and
 * rejects '..' outright rather than resolving it, so no path can climb out.
 */
export function normalizeWorkspacePath(input: string, defaultRoot: WorkspaceRoot = 'notes'): string {
  const raw = input.trim();
  if (!raw) throw new Error('Path is empty.');
  const absolute = raw.startsWith('/') ? raw : `/${defaultRoot}/${raw}`;
  const segments = absolute.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.some((s) => s === '..')) throw new Error(`Path "${input}" may not contain "..".`);
  const path = '/' + segments.join('/');
  if (!isWorkspacePath(path)) throw new Error(`Path "${input}" is not a valid workspace path.`);
  return path;
}

/** The top-level folder of a normalized path, or undefined for '/' itself. */
export function rootOf(path: string): string | undefined {
  return path.split('/')[1];
}
