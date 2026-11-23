import { describe, expect, it } from 'vitest';
import { contextBand, grepFiles, lexicalSearch, lineSpans, readWindow, safeRegex, splitLines, WRAP } from './workspace-text';

describe('context bands (D-29)', () => {
  it('maps context windows to the three bands', () => {
    expect(contextBand(4096)).toEqual({ lines: 120, chars: 3000, calls: 12 });
    expect(contextBand(8192)).toEqual({ lines: 120, chars: 3000, calls: 12 });
    expect(contextBand(16384)).toEqual({ lines: 250, chars: 8000, calls: 16 });
    expect(contextBand(131072)).toEqual({ lines: 400, chars: 16000, calls: 24 });
  });
});

describe('line model', () => {
  it('wraps long lines so every character stays reachable', () => {
    const text = 'short\n' + 'x'.repeat(WRAP * 2 + 10) + '\nword '.repeat(3);
    const lines = splitLines(text);
    expect(lines[0]).toBe('short');
    expect(lines.slice(1, 4).map((l) => l.length)).toEqual([WRAP, WRAP, 10]);
    expect(lines.every((l) => l.length <= WRAP)).toBe(true);
    expect(lines.join('')).toBe(text.replace(/\n/g, ''));
  });
  it('prefers wrapping at a space', () => {
    const text = `${'a'.repeat(300)} ${'b'.repeat(300)}`;
    expect(splitLines(text)).toEqual([`${'a'.repeat(300)} `, 'b'.repeat(300)]);
    expect(lineSpans('')).toEqual([]);
  });
});

describe('readWindow', () => {
  const text = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
  it('numbers lines, marks pages and gives an exact continue hint', () => {
    const pages = [{ page: 1, start: 0, end: 60 }, { page: 2, start: 60, end: text.length }];
    const w = readWindow('/uploads/a.pdf', text, pages, 1, 10, 3000);
    expect(w.output).toContain('--- page 1 ---\n1: line 1');
    expect(w.output).toContain('(Showing lines 1-10 of 30. Use offset=11 to continue.)');
    expect(w.output).toContain('--- page 2 ---');
    expect([w.startLine, w.endLine, w.pageStart, w.pageEnd]).toEqual([1, 10, 1, 2]);
    expect(w.excerpt.split('\n')).toHaveLength(10);
  });
  it('stops at the character budget but always returns at least one line', () => {
    const w = readWindow('/notes/a.md', text, undefined, 25, 100, 140);
    expect(w.startLine).toBe(25); expect(w.endLine).toBeGreaterThanOrEqual(25);
    expect(readWindow('/notes/a.md', text, undefined, 28, 10, 3000).output).toContain('(End of file: 30 lines.)');
    expect(() => readWindow('/notes/a.md', text, undefined, 31, 10, 3000)).toThrow('past the end');
  });
});

describe('search and grep', () => {
  const files = [{ path: '/notes/a.md', text: 'Atlas launches in November.\nNothing here.' }, { path: '/uploads/b.txt', text: 'The atlas team\nlaunch plan for Atlas' }];
  it('ranks lines by matched query words', () => {
    const hits = lexicalSearch(files, 'Atlas launch');
    expect(hits[0]).toMatchObject({ path: '/notes/a.md', line: 1 });
    expect(hits.map((h) => `${h.path}:${h.line}`)).toContain('/uploads/b.txt:2');
  });
  it('greps literally by default and with guarded regexes on request', () => {
    expect(grepFiles(files, 'Atlas').hits.map((h) => h.line)).toEqual([1, 2]);
    expect(grepFiles(files, 'atlas', { ignoreCase: true }).hits).toHaveLength(3);
    expect(grepFiles(files, 'launch(es)?', { regex: true }).hits).toHaveLength(2);
    expect(grepFiles(files, 'a', { max: 1 }).more).toBeGreaterThan(0);
  });
  it('rejects regexes that can backtrack catastrophically', () => {
    for (const bad of ['(a+)+$', '(\\w*)*x', '(a|aa){2,}', '(x)\\1', 'a'.repeat(201), 'a*b*c*d*e*f*g*', '[']) expect(() => safeRegex(bad, false)).toThrow();
    expect(safeRegex('^\\d{3}-\\d{4}$', false).test('555-1234')).toBe(true);
  });
});
