import { describe, it, expect } from 'vitest';
import type { Message } from '../providers/types';
import {
  recencyBoundaryIndex,
  fitToBudget,
  reserveForResponse,
  RESPONSE_RESERVE_FLOOR,
} from './conversation-budget';

let seq = 0;
function m(role: Message['role'], content = 'hello'): Message {
  return { id: `m${seq++}`, threadId: 't', role, content, createdAt: seq };
}

describe('recencyBoundaryIndex', () => {
  it('keeps everything when too few exchanges exist', () => {
    const msgs = [m('user'), m('assistant')];
    expect(recencyBoundaryIndex(msgs, 1)).toBe(0);
  });

  it('idle/manual: keeps the last completed exchange (no pending user)', () => {
    // [u0, a1, u2, a3] — keep [u2, a3] → boundary at index 2
    const msgs = [m('user'), m('assistant'), m('user'), m('assistant')];
    expect(recencyBoundaryIndex(msgs, 1)).toBe(2);
  });

  it('send time: a trailing pending user keeps the prior exchange + pending', () => {
    // [u0, a1, u2, a3, u4(pending)] — keep [u2, a3, u4] → boundary at index 2
    const msgs = [
      m('user'),
      m('assistant'),
      m('user'),
      m('assistant'),
      m('user'),
    ];
    expect(recencyBoundaryIndex(msgs, 1)).toBe(2);
  });

  it('keepExchanges <= 0 protects nothing (boundary = length)', () => {
    const msgs = [m('user'), m('assistant')];
    expect(recencyBoundaryIndex(msgs, 0)).toBe(msgs.length);
  });
});

describe('fitToBudget', () => {
  it('is empty-safe', () => {
    const r = fitToBudget([], 1000);
    expect(r.kept).toEqual([]);
    expect(r.dropped).toEqual([]);
    expect(r.singleMessageOverflow).toBe(false);
  });

  it('keeps everything when it fits', () => {
    const msgs = [m('user', 'abcd'), m('assistant', 'abcd')];
    const r = fitToBudget(msgs, 1000);
    expect(r.kept).toHaveLength(2);
    expect(r.dropped).toHaveLength(0);
  });

  it('drops oldest from the head to fit, newest-first', () => {
    // each message ~ 1 + 4 = 5 tokens. budget 12 keeps ~2 messages.
    const msgs = [
      m('user', 'abcd'),
      m('assistant', 'abcd'),
      m('user', 'abcd'),
    ];
    const r = fitToBudget(msgs, 12);
    expect(r.kept.length).toBeLessThan(3);
    expect(r.kept.at(-1)).toBe(msgs.at(-1)); // latest always kept
    expect(r.dropped.length).toBe(msgs.length - r.kept.length);
  });

  it('always keeps the latest message and flags single-message overflow', () => {
    const big = m('user', 'a'.repeat(1000)); // ~250 tok
    const r = fitToBudget([m('user', 'abcd'), big], 10);
    expect(r.kept).toContain(big);
    expect(r.singleMessageOverflow).toBe(true);
  });
});

describe('reserveForResponse', () => {
  it('reserves only the small floor, not the full maxTokens', () => {
    expect(reserveForResponse(8192, 16384)).toBe(RESPONSE_RESERVE_FLOOR);
  });

  it('reserves maxTokens when it is below the floor', () => {
    expect(reserveForResponse(8192, 100)).toBe(100);
  });
});
