import { afterEach, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from './index';
import type { ChatChunk, ChatParams } from '../types';
afterEach(() => vi.unstubAllGlobals());
const params: ChatParams = { modelId: 'fixture', messages: [{ id: 'u', threadId: 't', createdAt: 1, role: 'user', content: 'hello' }] };
const provider = (id: string) => new OpenAICompatibleProvider({ id, displayName: id, usesKey: false, offDevice: false, defaultBaseURL: 'https://fixture.test/v1', description: 'fixture' });
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
function stream(text: string, split = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split)); controller.close(); } }));
}
it.each(['ollama', 'lmstudio', 'openai-compat'])('%s serializes complete call/result groups and separates streamed events', async (id) => {
  const fetch = vi.fn(async () => stream(
    event({ choices: [{ delta: { reasoning_content: 'think' } }] }) +
    event({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'lookup', arguments: '{' } }] } }] }) +
    event({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: 'tool_calls' }] }) +
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } })}`,
  ));
  vi.stubGlobal('fetch', fetch);
  const output: ChatChunk[] = [];
  for await (const chunk of provider(id).chat({ ...params, messages: [...params.messages,
    { id: 'a', threadId: 't', createdAt: 1, role: 'assistant', content: '', reasoning: 'prior thought', toolCalls: [{ id: 'prior', name: 'lookup', arguments: '{}' }] },
    { id: 'r', threadId: 't', createdAt: 1, role: 'tool', content: 'result', toolCallId: 'prior' },
  ], tools: [{ name: 'lookup', description: 'Read', parameters: { type: 'object' } }] })) output.push(chunk);
  const request = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(request.messages[1]).toMatchObject({ tool_calls: [{ id: 'prior', type: 'function', function: { name: 'lookup', arguments: '{}' } }], reasoning_content: 'prior thought' });
  expect(request.messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'prior', content: 'result' });
  expect(request.parallel_tool_calls).toBe(false);
  expect(output[0]?.reasoning).toBe('think');
  expect(output[1]?.toolCalls?.[0]?.id).toBe('c');
  expect(output[2]?.finishReason).toBe('tool_calls');
  expect(output[3]?.usage?.promptTokens).toBe(10);
});
it('fails closed on malformed streamed JSON instead of skipping a call fragment', async () => {
  vi.stubGlobal('fetch', async () => stream('data: {broken}\n\n'));
  await expect(async () => { for await (const _ of provider('fixture').chat(params)) { /* drain */ } }).rejects.toThrow('Malformed');
});
it('replays reasoning in the field it arrived in and skips empty reasoning fields', async () => {
  const fetch = vi.fn(async () => stream(
    event({ choices: [{ delta: { reasoning_content: '', reasoning: 'ollama thought' } }] }) +
    event({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
  ));
  vi.stubGlobal('fetch', fetch);
  const output: ChatChunk[] = [];
  for await (const chunk of provider('ollama').chat({ ...params, messages: [...params.messages,
    { id: 'a', threadId: 't', createdAt: 1, role: 'assistant', content: '', reasoning: 'prior', reasoningField: 'reasoning', toolCalls: [{ id: 'p', name: 'lookup', arguments: '{}' }] },
    { id: 'r', threadId: 't', createdAt: 1, role: 'tool', content: 'result', toolCallId: 'p' },
  ] })) output.push(chunk);
  const request = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(request.messages[1]).toMatchObject({ reasoning: 'prior' });
  expect(request.messages[1]).not.toHaveProperty('reasoning_content');
  expect(output[0]).toMatchObject({ reasoning: 'ollama thought', reasoningField: 'reasoning' });
});
const probeProvider = (toolProbe?: 'lmstudio' | 'ollama') => new OpenAICompatibleProvider({ id: 'p', displayName: 'p', usesKey: false, offDevice: false, defaultBaseURL: 'http://localhost:9/v1', description: 'p', toolProbe });
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
it('reads tool support from OpenRouter-style supported_parameters', async () => {
  vi.stubGlobal('fetch', async () => json({ data: [{ id: 'a', supported_parameters: ['tools', 'temperature'] }, { id: 'b', supported_parameters: ['temperature'] }, { id: 'c' }] }));
  const models = await probeProvider().listModels();
  expect(models.map((m) => m.toolCalls)).toEqual([true, false, undefined]);
});
it('probes LM Studio capabilities once for all models', async () => {
  const fetch = vi.fn(async (url: string) => url.endsWith('/api/v0/models')
    ? json({ data: [{ id: 'gemma', capabilities: ['tool_use'] }, { id: 'tiny', capabilities: [] }] })
    : json({ data: [{ id: 'gemma' }, { id: 'tiny' }, { id: 'other' }] }));
  vi.stubGlobal('fetch', fetch);
  const models = await probeProvider('lmstudio').listModels();
  expect(models.map((m) => m.toolCalls)).toEqual([true, false, undefined]);
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/v0/models'))).toHaveLength(1);
  expect(fetch.mock.calls.some(([url]) => url === 'http://localhost:9/api/v0/models')).toBe(true);
});
it('probes Ollama per model and treats probe failures as unknown', async () => {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/show')) {
      const model = JSON.parse(String(init?.body)).model;
      if (model === 'broken') throw new TypeError('Failed to fetch');
      return json({ capabilities: model === 'qwen' ? ['completion', 'tools'] : ['completion'] });
    }
    return json({ data: [{ id: 'qwen' }, { id: 'gemma' }, { id: 'broken' }] });
  });
  const provider = probeProvider('ollama');
  expect((await provider.listModels()).map((m) => m.toolCalls)).toEqual([true, false, undefined]);
  expect(await provider.detectToolSupport('qwen')).toBe(true);
});
