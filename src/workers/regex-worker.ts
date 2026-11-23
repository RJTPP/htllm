/// <reference lib="webworker" />
/**
 * Runs model-supplied grep patterns off the main thread. A pattern that
 * backtracks badly cannot be interrupted mid-match, so the caller terminates
 * this worker on a deadline instead of freezing the page.
 */
self.onmessage = (event: MessageEvent<{ pattern: string; flags: string; texts: string[] }>) => {
  const re = new RegExp(event.data.pattern, event.data.flags);
  self.postMessage(event.data.texts.map((text) => re.test(text)));
};
