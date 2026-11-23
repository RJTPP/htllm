import { describe, expect, it } from 'vitest';
import { parseThinking, stripThinking } from './thinking';

describe('parseThinking', () => {
  it('splits a leading think block from the reply', () => {
    expect(parseThinking('<think>plan</think>\n\nAnswer.')).toEqual({ thinking: 'plan', reply: 'Answer.', isThinking: false });
  });
  it('reports an open block as still thinking', () => {
    expect(parseThinking('<think>partial')).toEqual({ thinking: 'partial', reply: '', isThinking: true });
    expect(parseThinking('Checked the file.<think>more')).toEqual({ thinking: 'more', reply: 'Checked the file.', isThinking: true });
  });
  it('leaves plain replies alone', () => {
    expect(parseThinking('Just an answer.')).toEqual({ thinking: null, reply: 'Just an answer.', isThinking: false });
  });
  it('collects every block across tool rounds, with either tag name', () => {
    // Gemma 4 on LM Studio, recorded by the live eval (A05, A03, R02).
    expect(parseThinking('<think>grep failed.</think><think>check others.</think>Not found.'))
      .toEqual({ thinking: 'grep failed.\n\ncheck others.', reply: 'Not found.', isThinking: false });
    const a03 = '<thought\nno revenue yet.<thought>tried annual.<thought>check cedar.\n</thought><thought>read all.\n</thought>I cannot find it.';
    expect(parseThinking(a03)).toEqual({ thinking: 'no revenue yet.\n\ntried annual.\n\ncheck cedar.\n\nread all.', reply: 'I cannot find it.', isThinking: false });
    const r02 = '<thought\ntwo parts.<thought>have trigger.</think><thought>checked all.</think>Based on the notes: 2 percent.';
    expect(parseThinking(r02).reply).toBe('Based on the notes: 2 percent.');
  });
  it('keeps tags inside fenced code as text', () => {
    const text = 'Example:\n```html\n<think>literal</think>\n```\nDone.';
    expect(parseThinking(text)).toEqual({ thinking: null, reply: text, isThinking: false });
  });
  it('keeps tags mentioned in prose or inline code as text', () => {
    for (const text of ['Qwen wraps reasoning in `<think>` tags.', 'Qwen wraps reasoning in <think> tags, closed by </think>.', 'Use <thought tags sparingly.'])
      expect(parseThinking(text)).toEqual({ thinking: null, reply: text, isThinking: false });
    expect(parseThinking('Line one.\n<think>plan</think>Answer.').reply).toBe('Line one.\nAnswer.');
  });
  it('does not treat similar words or tags as thinking', () => {
    expect(parseThinking('A <thoughtful> reply about <thinking>.').thinking).toBeNull();
  });
});

describe('stripThinking', () => {
  it('removes complete blocks anywhere and keeps an open one as text', () => {
    expect(stripThinking('<think>a</think>One.<thought>b</thought> Two.')).toBe('One. Two.');
    expect(stripThinking('  <think>unfinished')).toBe('<think>unfinished');
    expect(stripThinking('Plain.')).toBe('Plain.');
  });
});
