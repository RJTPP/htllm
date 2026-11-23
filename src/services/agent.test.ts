import { describe, it, expect, vi } from 'vitest';
import { executeChat, type AgentOptions } from './agent';
import type { ChatChunk, ChatProvider, ChatParams } from '../providers/types';
import type { ExecutableTool } from './tools';

const tool = (execute = vi.fn(async () => ({ text: 'evidence' }))): ExecutableTool => ({ name: 'lookup', description: 'Look up evidence', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, execute });
const call = (args = '{"query":"hello"}', id = 'call-1'): ChatChunk[] => [
  { delta: '', toolCalls: [{ index: 0, id, name: 'lookup', arguments: args.slice(0, 8) }] },
  { delta: '', toolCalls: [{ index: 0, arguments: args.slice(8) }] },
  { delta: '', finishReason: 'tool_calls' },
];
function provider(turns: ChatChunk[][]) {
  const requests: ChatParams[] = [];
  const chat = vi.fn(async function* (params: ChatParams) {
    requests.push(structuredClone({ ...params, signal: undefined }));
    for (const chunk of turns[requests.length - 1] ?? [{ delta: 'done', finishReason: 'stop' }]) yield chunk;
  });
  return { provider: { id: 'mock', chat } as unknown as ChatProvider, requests };
}
async function run(turns: ChatChunk[][], tools: ExecutableTool[], patch: Partial<AgentOptions> = {}, signal?: AbortSignal) {
  const mock = provider(turns);
  const opts: AgentOptions = { tools, contextWindow: 8192, approve: vi.fn(async () => true), onActivity: vi.fn(), onSources: vi.fn(), ...patch };
  const output: ChatChunk[] = [];
  for await (const chunk of executeChat(mock.provider, { modelId: 'mock', messages: [{ id: 'u', threadId: 't', createdAt: 0, role: 'user', content: 'question' }], maxTokens: 256, signal }, opts)) output.push(chunk);
  return { ...mock, opts, output };
}
describe('agent execution boundary', () => {
  it('assembles argument fragments and sends matched call/result messages', async () => {
    const t = tool(); const result = await run([call()], [t]);
    expect(t.execute).toHaveBeenCalledOnce();
    expect(t.execute).toHaveBeenCalledWith({ query: 'hello' }, expect.any(AbortSignal), expect.any(Number));
    const history = result.requests[1]!.messages;
    expect(history.find((m) => m.toolCalls)?.toolCalls?.[0]?.id).toBe('call-1');
    expect(history.find((m) => m.role === 'tool')?.toolCallId).toBe('call-1');
  });
  it('keeps the reasoning field of a tool-calling turn when replaying it', async () => {
    const turn: ChatChunk[] = [{ delta: '', reasoning: 'plan', reasoningField: 'reasoning' }, ...call()];
    const result = await run([turn], [tool()]);
    expect(result.requests[1]!.messages.find((m) => m.toolCalls)).toMatchObject({ reasoning: 'plan', reasoningField: 'reasoning' });
  });
  it('never executes truncated streaming calls', async () => {
    const t = tool(); await expect(run([call().slice(0, 2)], [t])).rejects.toThrow('Incomplete');
    expect(t.execute).not.toHaveBeenCalled();
  });
  it.each(['{"query":4}', '{broken', '{"query":"x","extra":1}'])('rejects invalid arguments %s', async (args) => {
    const t = tool(); await run([call(args)], [t]); expect(t.execute).not.toHaveBeenCalled();
  });
  it('does not execute denied calls or request approval repeatedly for the same arguments', async () => {
    const t = { ...tool(), server: 'external' }; const approve = vi.fn(async () => false);
    await run([call(), call(undefined, 'call-2')], [t], { approve });
    expect(approve).toHaveBeenCalledOnce(); expect(t.execute).not.toHaveBeenCalled();
  });
  it('enforces the execution limit and requests a tools-free final answer', async () => {
    const t = tool(); const result = await run([call()], [t], { maxCalls: 1 });
    expect(result.requests[1]!.tools).toBeUndefined(); expect(t.execute).toHaveBeenCalledOnce();
  });
  it('stops offering tools after an ambiguous external failure', async () => {
    const execute = vi.fn(async () => { throw new Error('lost connection'); });
    const result = await run([call()], [{ ...tool(execute), server: 'external' }]);
    expect(execute).toHaveBeenCalledOnce(); expect(result.requests[1]!.tools).toBeUndefined();
  });
  it('times out an uncooperative tool without retrying it', async () => {
    const execute = vi.fn(() => new Promise<{text: string}>(() => {}));
    const result = await run([call()], [{ ...tool(execute), server: 'external' }], { timeoutMs: 5 });
    expect(result.requests[1]!.tools).toBeUndefined(); expect(execute).toHaveBeenCalledOnce();
  });
  it('does not execute queued calls after an ambiguous external failure', async () => {
    const execute = vi.fn(async () => { throw new Error('lost connection'); });
    await run([[{ delta: '', toolCalls: [
      { index: 0, id: 'a', name: 'lookup', arguments: '{"query":"first"}' },
      { index: 1, id: 'b', name: 'lookup', arguments: '{"query":"second"}' },
    ], finishReason: 'tool_calls' }]], [{ ...tool(execute), server: 'external' }]);
    expect(execute).toHaveBeenCalledOnce();
  });
  it('aborting prevents all tool calls', async () => {
    const controller = new AbortController(); controller.abort(); const t = tool();
    await expect(run([call()], [t], {}, controller.signal)).rejects.toThrow(); expect(t.execute).not.toHaveBeenCalled();
  });
  it('rejects an over-budget request before invoking the provider', async () => {
    await expect(run([], [tool()], { contextWindow: 128 })).rejects.toThrow('context budget');
  });
});
