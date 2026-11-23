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
// Workspace citations, as recorded by the live eval (Gemma 4 on LM Studio).
const workspace = [
  { id: 'atlas:L1-1', chunkId: 'atlas:L1-1', documentId: 'atlas', filename: '/library/Project notes/atlas.md', excerpt: 'Atlas launches on November 12.', lineStart: 1, lineEnd: 1 },
  { id: 'ops:L1-1', chunkId: 'ops:L1-1', documentId: 'ops', filename: '/library/Project notes/operations.md', excerpt: 'Key rotation November 3.', lineStart: 1, lineEnd: 1 },
  { id: 'ops:L8-9', chunkId: 'ops:L8-9', documentId: 'ops', filename: '/library/Project notes/operations.md', excerpt: 'Rollback at 2 percent.', lineStart: 8, lineEnd: 9 },
];
it('resolves a file cited by path, name, line or range when exactly one supplied source fits', () => {
  expect(citationIndex('/library/Project notes/atlas.md', workspace)).toBe(0);
  expect(citationIndex('atlas.md', workspace)).toBe(0);
  expect(citationIndex('/library/Project notes/operations.md:1', workspace)).toBe(1);
  expect(citationIndex('/library/Project notes/operations.md:L1-1', workspace)).toBe(1);
  expect(citationIndex('operations.md:L9', workspace)).toBe(2);
  expect(citationIndex('/library/Project notes/atlas.md:L5-6', workspace)).toBe(0);
  // Two excerpts of one file and no line to choose between them; or no line that fits.
  expect(citationIndex('/library/Project notes/operations.md', workspace)).toBe(-1);
  expect(citationIndex('operations.md:L4', workspace)).toBe(-1);
  expect(citationIndex('budget.md:L1-1', workspace)).toBe(-1);
  expect(citationIndex('tlas.md', workspace)).toBe(-1);
});
it('renders grouped references as one citation each', () => {
  const html = renderCitationHtml('<p>Owners [[Source atlas:L1-1], [Source ops:L1-1]] and [[Source atlas:L1-1, Source ops:L8-9]] and [[Source atlas:L1-1], [Source nope]].</p>', workspace);
  expect(html.match(/data-source-index="0"/g)).toHaveLength(3);
  expect(html.match(/data-source-index="1"/g)).toHaveLength(1);
  expect(html.match(/data-source-index="2"/g)).toHaveLength(1);
  expect(html).toContain('unresolved source: nope');
  expect(html).not.toContain('[Source');
});
