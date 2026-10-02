import { expect, it } from 'vitest';
import { activityContext, withActivityContext } from './message-context';
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
