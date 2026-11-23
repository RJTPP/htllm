import { describe, expect, it } from 'vitest';
import { appContext } from './system-context';
import { DEFAULT_SYSTEM_PROMPT } from '../data/settings';

describe('appContext', () => {
  const now = new Date(2026, 10, 23, 12);
  it('gives the date in every mode and the no-tools note only in Chat', () => {
    expect(appContext({ now, workspace: false })).toBe('Today is Monday, November 23, 2026. This chat has no tools or file access. If the user needs you to read or write files, suggest starting a Workspace chat.');
    expect(appContext({ now, workspace: true })).toBe('Today is Monday, November 23, 2026.');
  });
  it('keeps the editable default short and accurate about where the model runs', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('htllm');
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/running locally/);
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeLessThan(400);
  });
});
