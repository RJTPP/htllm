import { describe, expect, it } from 'vitest';
import { downloadName, downloadType, renderKind } from './file-kind';
import { parseCsv } from './csv';

describe('renderKind', () => {
  it('picks markdown, tables, JSON, code and text; HTML and SVG stay code', () => {
    expect(renderKind('/notes/a.md')).toEqual({ kind: 'markdown' });
    expect(renderKind('/notes/data.csv').kind).toBe('csv');
    expect(renderKind('/notes/x.json').kind).toBe('json');
    expect(renderKind('/notes/app.py')).toEqual({ kind: 'code', language: 'python' });
    expect(renderKind('/notes/page.html')).toEqual({ kind: 'code', language: 'html' });
    expect(renderKind('/notes/icon.svg')).toEqual({ kind: 'code', language: 'xml' });
    expect(renderKind('/uploads/report.pdf').kind).toBe('text');
    expect(renderKind('/notes/README').kind).toBe('text');
  });
  it('downloads extracted PDFs honestly as text', () => {
    expect(downloadName('/uploads/report.pdf')).toBe('report.pdf.txt');
    expect(downloadType('/uploads/report.pdf', 'application/pdf')).toBe('text/plain');
    expect(downloadName('/notes/a.md')).toBe('a.md');
  });
});

describe('parseCsv', () => {
  it('handles quotes, embedded commas and newlines, and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"multi\nline",2').rows).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', '2']]);
  });
  it('caps rows', () => {
    const out = parseCsv('1\n2\n3\n4', 2);
    expect(out).toEqual({ rows: [['1'], ['2']], truncated: true });
  });
});
