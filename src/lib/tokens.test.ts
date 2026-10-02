import { describe, it, expect } from 'vitest';
import type { Message } from '../providers/types';
import {
  estimateStringTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
} from './tokens';

const PER_MSG_OVERHEAD = 4;

function msg(role: Message['role'], content: Message['content']): Message {
  return { id: 'x', threadId: 't', role, content, createdAt: 0 };
}

describe('estimateStringTokens', () => {
  it('returns 0 for empty', () => {
    expect(estimateStringTokens('')).toBe(0);
  });

  it('uses chars/4, rounded up', () => {
    expect(estimateStringTokens('abcd')).toBe(1); // 4/4
    expect(estimateStringTokens('abcde')).toBe(2); // ceil(5/4)
    expect(estimateStringTokens('a'.repeat(8))).toBe(2);
  });

  it('scales by the calibration ratio', () => {
    expect(estimateStringTokens('abcd', 2)).toBe(2);
    expect(estimateStringTokens('a'.repeat(8), 0.5)).toBe(1);
  });
});

describe('estimateMessageTokens', () => {
  it('adds the per-message envelope overhead', () => {
    expect(estimateMessageTokens(msg('user', 'abcd'))).toBe(1 + PER_MSG_OVERHEAD);
  });

  it('strips <think> blocks from assistant content (not counted)', () => {
    const withThink = msg(
      'assistant',
      '<think>a very long private reasoning trace that should not count</think>abcd',
    );
    // Only "abcd" (1 tok) should count toward the body.
    expect(estimateMessageTokens(withThink)).toBe(1 + PER_MSG_OVERHEAD);
  });

  it('does NOT strip <think> from user content', () => {
    const u = msg('user', '<think>kept</think>');
    expect(estimateMessageTokens(u)).toBeGreaterThan(PER_MSG_OVERHEAD);
  });

  it('counts image parts at a fixed estimate', () => {
    const m = msg('user', [
      { type: 'text', text: 'abcd' },
      { type: 'image_url', image_url: { url: 'data:...' } },
    ]);
    // text(1) + image(85) + overhead(4)
    expect(estimateMessageTokens(m)).toBe(1 + 85 + PER_MSG_OVERHEAD);
  });
});

describe('estimateMessagesTokens', () => {
  it('sums per-message estimates', () => {
    const msgs = [msg('user', 'abcd'), msg('assistant', 'abcd')];
    expect(estimateMessagesTokens(msgs)).toBe(2 * (1 + PER_MSG_OVERHEAD));
  });

  it('is empty-safe', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});
