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

describe('split and aggregate', () => {
  function recorder(failAt = -1) {
    const requests: ChatParams[] = [];
    const provider = stubProvider([]);
    provider.chat = async function* (params) {
      requests.push(params);
      if (requests.length === failAt) throw new Error('fixture failure');
      yield { delta: `Summary of part ${requests.length}.` };
    };
    return { provider, requests };
  }
  it('preserves the original single call, prior-summary prompt and uncapped generation', async () => {
    const { provider, requests } = recorder();
    expect(await compact(transcript, provider, 'test', { contextWindow: 8192, priorSummary: 'Earlier decisions' })).toEqual({ text: 'Summary of part 1.' });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.maxTokens).toBeUndefined();
    expect(requests[0]!.reasoningEffort).toBe('off');
    expect(String(requests[0]!.messages[0]!.content)).toContain('<previous-compaction-summary>\nEarlier decisions');
  });
  it('splits large input and aggregates all parts in chronological order', async () => {
    const { provider, requests } = recorder();
    const result = await compact([{ ...transcript[0]!, content: 'START ' + 'x'.repeat(25000) + ' END' }], provider, 'test', { contextWindow: 4096, priorSummary: 'Earlier decisions' });
    expect(result).not.toBeNull(); expect(requests.length).toBeGreaterThan(2);
    const inputs = requests.map((r) => String(r.messages[0]!.content));
    expect(inputs[0]).toContain('Earlier decisions');
    expect(inputs.join('\n')).toContain('START'); expect(inputs.join('\n')).toContain(' END');
    expect(inputs.at(-1)).toContain('### Part 1\nSummary of part 1.');
    for (const request of requests) {
      expect(request.maxTokens).toBeUndefined();
      expect(String(request.messages[0]!.content).length).toBeLessThanOrEqual(4096 * 4 * 0.75);
    }
  });
  it('returns no aggregate when an intermediate request fails', async () => {
    const { provider, requests } = recorder(2);
    expect(await compact([{ ...transcript[0]!, content: 'x'.repeat(25000) }], provider, 'test', { contextWindow: 4096 })).toBeNull();
    expect(requests).toHaveLength(2);
  });
  it('keeps previous output handling including length finishes and stored clipping', async () => {
    const result = await compact(transcript, stubProvider([{ delta: 'x'.repeat(10000), finishReason: 'length' }]), 'test', { contextWindow: 4096 });
    expect(result?.text).toBe('x'.repeat(8192) + '…');
  });
});
