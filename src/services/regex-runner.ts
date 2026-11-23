import { safeRegex } from '../lib/workspace-text';

/** How long one grep pattern may run before it is stopped. */
export const REGEX_DEADLINE_MS = 2000;

/**
 * Test each text against a model-supplied regex. In the browser this runs in
 * a Web Worker that is terminated after the deadline, so even a pattern that
 * backtracks for hours cannot freeze the page. Without Worker (unit tests),
 * it runs in place behind the same syntax guard.
 */
export function testRegex(pattern: string, ignoreCase: boolean, texts: string[], deadlineMs = REGEX_DEADLINE_MS): Promise<boolean[]> {
  const re = safeRegex(pattern, ignoreCase); // validates; throws readable errors
  if (typeof Worker === 'undefined') return Promise.resolve(texts.map((t) => re.test(t)));
  const worker = new Worker(new URL('../workers/regex-worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`The pattern took longer than ${deadlineMs / 1000} s and was stopped. Simplify it, or grep for plain text without regex.`));
    }, deadlineMs);
    worker.onmessage = (event: MessageEvent<boolean[]>) => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('The pattern could not be run.')); };
    worker.postMessage({ pattern, flags: ignoreCase ? 'i' : '', texts });
  });
}
