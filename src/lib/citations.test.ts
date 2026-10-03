// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { citationIndex, renderCitationHtml } from './citations';
const sources = [{ id: 'chunk-a', chunkId: 'chunk-a', documentId: 'doc-a', filename: 'test.txt', excerpt: 'Saved evidence' }];
it('resolves stable and numeric references only within supplied evidence', () => {
  expect(citationIndex('chunk-a: test.txt', sources)).toBe(0);
  expect(citationIndex('1', sources)).toBe(0);
  expect(citationIndex('2', sources)).toBe(-1);
  expect(citationIndex('unknown: test.txt', sources)).toBe(-1);
  expect(citationIndex('test.txt', sources)).toBe(0);
  expect(citationIndex('test.txt', [...sources, { ...sources[0]!, id: 'other' }])).toBe(-1);
});
it('renders valid references and marks unknown references without guessing', () => {
  const html = renderCitationHtml('<p>Fact [[Source chunk-a: test.txt]] and [[Source 1]] and [[Source: test.txt]] and [[Source 9]].</p>', sources);
  expect(html.match(/data-source-index="0"/g)).toHaveLength(3);
  expect(html).toContain('unresolved source: 9');
});
it('preserves code literals and strips executable HTML and spoofed citation attributes', () => {
  const html = renderCitationHtml('<code>[[Source 1]]</code><a data-source-index="0" href="javascript:alert(1)">fake</a><img src=x onerror=alert(1)><p>[[Source 1]]</p>', sources);
  expect(html).toContain('<code>[[Source 1]]</code>');
  expect(html.match(/data-source-index/g)).toHaveLength(1);
  expect(html).not.toMatch(/javascript:|onerror|<img/);
});
