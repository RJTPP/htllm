import { describe, expect, it } from 'vitest';
import { isWorkspacePath, normalizeWorkspacePath, rootOf } from './workspace-path';

describe('workspace paths', () => {
  it('normalizes relative and messy paths', () => {
    expect(normalizeWorkspacePath('draft.md')).toBe('/notes/draft.md');
    expect(normalizeWorkspacePath('/notes//sub/./a.md/')).toBe('/notes/sub/a.md');
    expect(normalizeWorkspacePath('report.pdf', 'uploads')).toBe('/uploads/report.pdf');
    expect(rootOf('/library/Lib/x.md')).toBe('library');
  });
  it('never resolves "..", backslashes or control characters', () => {
    for (const bad of ['../x', '/notes/../uploads/a', '/notes/..', 'a\\b', '/notes/a\u0000', '', '   ']) {
      expect(() => normalizeWorkspacePath(bad)).toThrow();
    }
    expect(isWorkspacePath('/notes/a.md')).toBe(true);
    expect(isWorkspacePath('notes/a.md')).toBe(false);
    expect(isWorkspacePath('/notes/' + 'x'.repeat(600))).toBe(false);
  });
});
