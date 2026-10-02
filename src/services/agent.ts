import type { ChatProvider, ChatParams, ChatChunk, ToolCall, AgentEvent, SourceCitation, WireMessage } from '../providers/types';
import type { ExecutableTool } from './tools';
import { parseArguments } from './tools';
import { reserveForResponse } from '../lib/conversation-budget';
import { getCalibrationRatio } from '../lib/token-calibration';

export interface AgentOptions {
  tools: ExecutableTool[];
  contextWindow: number;
  approve: (tool: ExecutableTool, event: AgentEvent, signal: AbortSignal) => Promise<boolean>;
  onActivity: (events: AgentEvent[]) => void | Promise<void>;
  onSources: (sources: SourceCitation[]) => void;
  maxCalls?: number;
  timeoutMs?: number;
}
/** One execution pipeline for chat and agents. Wire tool groups stay together. */
export async function* executeChat(provider: ChatProvider, params: ChatParams, opts?: AgentOptions): AsyncGenerator<ChatChunk> {
  if (!opts) { yield* provider.chat(params); return; }
  const signal = params.signal ?? new AbortController().signal;
  const messages: WireMessage[] = [...params.messages];
  const activity: AgentEvent[] = [];
  const limit = opts.maxCalls ?? 8;
  let callsUsed = 0;
  let stopTools = false;
  let promptTokens = 0; let completionTokens = 0;
  const denied = new Set<string>();
  const definitions = opts.tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const wire = (role: WireMessage['role'], content: string): WireMessage => ({ id: crypto.randomUUID(), threadId: '', createdAt: Date.now(), role, content });
  const available = opts.contextWindow - reserveForResponse(opts.contextWindow, params.maxTokens ?? 512);
  const ratio = getCalibrationRatio(provider.id, params.modelId);
  // Reserve space for schemas and one bounded result. Never trim an active tool group.
  const size = () => Math.ceil((JSON.stringify(messages).length + JSON.stringify(definitions).length) / 4 * ratio);
  while (size() > available - 512) {
    const user = messages.findIndex((m) => m.role === 'user');
    const next = messages.findIndex((m, i) => i > user && m.role === 'user');
    if (user < 0 || next < 0) throw new Error('The message and selected tools exceed the context budget. Select fewer tools or increase the context window.');
    messages.splice(user, next - user);
  }
  for (;;) {
    signal.throwIfAborted();
    const final = stopTools || callsUsed >= limit;
    const partial = new Map<number, ToolCall>();
    let text = ''; let reasoning = ''; let finish: ChatChunk['finishReason'];
    let turnUsage: ChatChunk['usage'];
    if (size() > available) throw new Error('Agent context budget reached. Start a new turn with fewer tools or a larger context window.');
    for await (const chunk of provider.chat({ ...params, messages, maxTokens: Math.max(1, Math.min(params.maxTokens ?? 512, opts.contextWindow - size())), tools: final ? undefined : definitions, toolChoice: final ? 'none' : 'auto' })) {
      signal.throwIfAborted();
      text += chunk.delta; reasoning += chunk.reasoning ?? ''; finish = chunk.finishReason ?? finish;
      for (const part of chunk.toolCalls ?? []) {
        if (!Number.isInteger(part.index) || part.index < 0 || part.index > 32) throw new Error('Invalid tool call index');
        const call = partial.get(part.index) ?? { id: '', name: '', arguments: '' };
        call.id += part.id ?? ''; call.name += part.name ?? ''; call.arguments += part.arguments ?? '';
        if (call.arguments.length > 64000) throw new Error('Tool arguments exceed the size limit');
        partial.set(part.index, call);
      }
      if (chunk.usage) turnUsage = chunk.usage;
      yield { ...chunk, toolCalls: undefined, usage: chunk.usage ? { ...chunk.usage,
        promptTokens: promptTokens + chunk.usage.promptTokens,
        completionTokens: completionTokens + chunk.usage.completionTokens,
      } : undefined };
    }
    promptTokens += turnUsage?.promptTokens ?? 0;
    completionTokens += turnUsage?.completionTokens ?? 0;
    signal.throwIfAborted();
    if (!partial.size) return;
    if (final || finish !== 'tool_calls') throw new Error('Incomplete or unexpected tool call; nothing was executed.');
    const calls = [...partial.values()];
    if (calls.some((call) => !call.id || !call.name) || new Set(calls.map((c) => c.id)).size !== calls.length) throw new Error('Invalid tool call identifiers');
    messages.push({ ...wire('assistant', text), toolCalls: calls, reasoning: reasoning || undefined });
    for (const call of calls) {
      signal.throwIfAborted();
      const tool = opts.tools.find((t) => t.name === call.name);
      const event: AgentEvent = { id: call.id, tool: tool?.displayName ?? call.name, server: tool?.server, arguments: call.arguments, status: 'running' };
      activity.push(event);
      let result = '';
      let invoked = false;
      try {
        if (stopTools) throw new Error('Further tools are stopped because an external outcome is unknown.');
        if (callsUsed >= limit) throw new Error('Tool execution limit reached.');
        callsUsed++;
        if (!tool) throw new Error('Unknown or disabled tool');
        const args = parseArguments(tool, call.arguments);
        const signature = JSON.stringify([tool.name, args]);
        if (denied.has(signature)) throw new Error('This call was already denied.');
        if (tool.server) {
          event.status = 'approval'; await opts.onActivity([...activity]);
          if (!await opts.approve(tool, event, signal)) {
            event.status = 'denied'; result = 'The user denied this call. Do not retry it.';
            denied.add(signature);
          }
        }
        signal.throwIfAborted();
        if (event.status !== 'denied') {
          event.status = 'running'; await opts.onActivity([...activity]);
          const controller = new AbortController();
          const abort = () => controller.abort(signal.reason);
          signal.addEventListener('abort', abort, { once: true });
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const interrupted = new Promise<never>((_, reject) => {
              controller.signal.addEventListener('abort', () => reject(new Error('Tool interrupted; external outcome may be unknown.')), { once: true });
              timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
            });
            invoked = true;
            const output = await Promise.race([tool.execute(args, controller.signal), interrupted]);
            signal.throwIfAborted();
            const maxChars = Math.max(0, Math.min(8000, Math.floor((available - size() - 256) * 4 / ratio)));
            result = output.text.slice(0, maxChars);
            if (result.length < output.text.length) result += '\n[Result truncated]';
            if (maxChars < output.text.length && output.citations?.length) {
              // Only keep excerpts actually included in the supplied result.
              opts.onSources(output.citations.filter((source) => result.includes(source.excerpt)));
            } else opts.onSources(output.citations ?? []);
            event.status = 'complete';
          } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
        }
      } catch (error) {
        event.status = invoked && tool?.server ? 'unknown' : signal.aborted ? 'stopped' : 'error';
        if (event.status === 'unknown') stopTools = true;
        result = event.status === 'unknown' ? 'External call outcome unknown. Do not retry automatically.' : error instanceof Error ? error.message : 'Tool failed';
      }
      event.result = result;
      await opts.onActivity([...activity]);
      signal.throwIfAborted();
      messages.push({ ...wire('tool', result), toolCallId: call.id });
    }
    if (callsUsed >= limit) messages.push(wire('user', 'Tool budget reached. Give a final answer using existing evidence and explain any unfinished work.'));
  }
}
