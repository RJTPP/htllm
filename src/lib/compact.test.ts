import { describe, it, expect } from 'vitest';
import type {
  ChatProvider,
  ChatChunk,
  ChatParams,
  Message,
} from '../providers/types';
import { compact, formatSummaryBlock, formatTailBlock } from './compact';

/** A ChatProvider stub that yields a fixed set of chunks, ignoring input.
 *  Lets us drive compact()'s content/reasoning handling deterministically. */
function stubProvider(chunks: ChatChunk[]): ChatProvider {
  return {
    id: 'stub',
    displayName: 'Stub',
    authMode: 'none',
    needsModelLoad: false,
    capabilities: { streaming: true, toolCalls: false, vision: false },
    async listModels() {
      return [];
    },
    async *chat(_params: ChatParams): AsyncIterable<ChatChunk> {
      for (const c of chunks) yield c;
    },
  };
}

const transcript: Message[] = [
  { id: 'u', threadId: 't', role: 'user', content: 'question', createdAt: 0 },
  { id: 'a', threadId: 't', role: 'assistant', content: 'answer', createdAt: 1 },
];

describe('compact', () => {
  it('returns the summary from the content channel', async () => {
    const p = stubProvider([{ delta: 'A concise summary.' }]);
    const r = await compact(transcript, p, 'model-x');
    expect(r?.text).toBe('A concise summary.');
  });

  it('falls back to the reasoning channel when content is empty', async () => {
    // Regression: reasoning models (e.g. gpt-oss) emit the whole answer in
    // `reasoning` with no `content`. Without the fallback the summary came
    // back empty → nothing saved → divider never appeared.
    const p = stubProvider([
      { delta: '', reasoning: 'Summary produced in the reasoning channel.' },
    ]);
    const r = await compact(transcript, p, 'model-x');
    expect(r?.text).toBe('Summary produced in the reasoning channel.');
  });

  it('prefers content over reasoning when both are present', async () => {
    const p = stubProvider([
      { delta: 'Real summary.', reasoning: 'internal noise' },
    ]);
    const r = await compact(transcript, p, 'model-x');
    expect(r?.text).toBe('Real summary.');
  });

  it('returns null when both channels are empty', async () => {
    const p = stubProvider([{ delta: '   ', reasoning: '' }]);
    const r = await compact(transcript, p, 'model-x');
    expect(r).toBeNull();
  });

  it('strips <think> blocks from the produced summary', async () => {
    const p = stubProvider([
      { delta: '<think>scratch reasoning</think>Clean summary.' },
    ]);
    const r = await compact(transcript, p, 'model-x');
    expect(r?.text).toBe('Clean summary.');
  });

  it('strips a <summary> wrapper the model may echo', async () => {
    const p = stubProvider([{ delta: '<summary>Wrapped body</summary>' }]);
    const r = await compact(transcript, p, 'model-x');
    expect(r?.text).toBe('Wrapped body');
  });

  it('returns null with no model id', async () => {
    const p = stubProvider([{ delta: 'unused' }]);
    expect(await compact(transcript, p, '')).toBeNull();
  });

  it('returns null with no messages', async () => {
    const p = stubProvider([{ delta: 'unused' }]);
    expect(await compact([], p, 'model-x')).toBeNull();
  });
});

describe('summary block formatting', () => {
  it('history block wraps text in <summary> tags', () => {
    const out = formatSummaryBlock('hi');
    expect(out).toContain('<summary>');
    expect(out).toContain('hi');
    expect(out).toContain('</summary>');
  });

  it('tail block is a distinct <recent-context> block', () => {
    const out = formatTailBlock('hi');
    expect(out).toContain('<recent-context>');
    expect(out).not.toContain('<summary>');
  });
});
