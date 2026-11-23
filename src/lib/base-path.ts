/**
 * The site's base path: `/` by default (the hosted site and the offline zip), or a
 * path such as `/htllm/` set by `HTLLM_BASE` at build time. Always ends with a slash.
 */
export const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

/** A page path under the base, e.g. `appPath('app')` → `/htllm/app` with base `/htllm/`. */
export function appPath(path = '', base = BASE_PATH): string {
  return base + path.replace(/^\/+/, '');
}
