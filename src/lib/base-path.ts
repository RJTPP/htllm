/**
 * The site's base path: `/` for local and zip builds, `/htllm/` on GitHub Pages
 * (`HTLLM_BASE` at build time). Always ends with a slash.
 */
export const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

/** A page path under the base, e.g. `appPath('app')` → `/htllm/app` on Pages. */
export function appPath(path = '', base = BASE_PATH): string {
  return base + path.replace(/^\/+/, '');
}
