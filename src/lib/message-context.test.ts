import { expect, it } from 'vitest';
import { activityContext, stubOldActivity, withActivityContext } from './message-context';
import { estimateMessageTokens } from './tokens';
import { compact } from './compact';
import type { ChatProvider, Message } from '../providers/types';
const message: Message = { id: 'a', threadId: 't', role: 'assistant', createdAt: 1, content: 'Answer', activity: [{ id: 'c', tool: 'write', server: 'external', arguments: '{"value":1}', status: 'unknown', result: 'Outcome unknown; do not retry.' }] };
it('includes complete historical call/result groups in budgeting and compaction', async () => {
  const history = withActivityContext(message);
  expect(history.activity).toBeUndefined();
  expect(history.content).toContain(activityContext(message));
  expect(estimateMessageTokens(message)).toBe(estimateMessageTokens(history));
  let prompt = '';
  const provider: ChatProvider = { id: 'fixture', displayName: 'Fixture', authMode: 'none', needsModelLoad: false, capabilities: { streaming: true, toolCalls: true, vision: false }, listModels: async () => [], chat: async function* (params) { prompt = JSON.stringify(params.messages); yield { delta: 'summary' }; } };
  await compact([message], provider, 'fixture');
  expect(prompt).toContain('Outcome unknown; do not retry.');
  expect(prompt).toContain('arguments'); expect(prompt).toContain('unknown');
});
it('stubs long successful results on older turns only, keeping calls and short or risky results', () => {
  const long = 'x'.repeat(1000);
  const turn = (id: string, status: 'complete' | 'unknown' | 'error' = 'complete', result = long): Message => ({ id, threadId: 't', role: 'assistant', createdAt: 1, content: id, activity: [{ id: `c-${id}`, tool: 'read_document', arguments: '{"id":"d"}', status, result }] });
  const user: Message = { id: 'u', threadId: 't', role: 'user', createdAt: 1, content: 'q' };
  const out = stubOldActivity([turn('old'), user, turn('old-unknown', 'unknown'), user, turn('old-short', 'complete', 'short'), user, turn('recent-1'), user, turn('recent-2')]);
  expect(out[0]!.activity![0]!.result).toMatch(/^\[Old tool result cleared/);
  expect(out[0]!.activity![0]).toMatchObject({ tool: 'read_document', arguments: '{"id":"d"}', status: 'complete' });
  expect(out[2]!.activity![0]!.result).toBe(long);
  expect(out[4]!.activity![0]!.result).toBe('short');
  expect(out[6]!.activity![0]!.result).toBe(long);
  expect(out[8]!.activity![0]!.result).toBe(long);
});
it('sends stubbed rather than full old results to compaction', async () => {
  const big: Message = { ...message, activity: [{ id: 'c2', tool: 'search_knowledge', arguments: '{}', status: 'complete', result: 'evidence '.repeat(200) }] };
  let prompt = '';
  const provider: ChatProvider = { id: 'fixture', displayName: 'Fixture', authMode: 'none', needsModelLoad: false, capabilities: { streaming: true, toolCalls: true, vision: false }, listModels: async () => [], chat: async function* (params) { prompt = JSON.stringify(params.messages); yield { delta: 'summary' }; } };
  await compact([big], provider, 'fixture');
  expect(prompt).toContain('Old tool result cleared');
  expect(prompt).not.toContain('evidence evidence evidence');
});
