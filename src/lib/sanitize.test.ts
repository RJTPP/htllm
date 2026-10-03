// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { sanitizeHtml, sanitizeHighlight } from './sanitize';
it('removes executable HTML, event handlers, unsafe URLs and remote image loads', () => {
  const safe = sanitizeHtml('<script>alert(1)</script><img src="https://tracker/x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><svg onload="alert(1)"></svg><p onclick="alert(1)">text</p>');
  expect(safe).not.toMatch(/script|img|onerror|onclick|javascript:|svg/);
  expect(safe).toContain('text');
});
it('keeps safe links, code and tables', () => {
  expect(sanitizeHtml('<a href="https://example.com">source</a><pre><code>hello</code></pre><table><tr><td>A</td></tr></table>')).toContain('https://example.com');
});
it('keeps only validated token colors in the code-only sanitizer', () => {
  const html = sanitizeHighlight('<pre style="background:url(https://tracker)"><code><span style="color:#FFAA00;position:fixed" onclick="alert(1)">import</span><img src=x><a href="https://tracker">data</a></code></pre>');
  expect(html).toContain('color:#FFAA00');
  expect(html).not.toMatch(/url\(|position|onclick|img|href/);
  expect(sanitizeHtml('<span style="color:#FFAA00">model html</span>')).not.toContain('style');
});
