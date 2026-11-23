import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { McpConnection } from '../providers/types';
import { getKey } from '../data/keys';
import { listMcpConnections } from '../data/mcp';
import { schemaValidator, type ExecutableTool } from './tools';
import { clearToolTrust } from './approvals';

export function validateMcpUrl(input: string): URL {
  const url = new URL(input);
  if (url.username || url.password || url.hash || url.search) throw new Error('Use an endpoint without credentials, query parameters, or fragments.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('MCP requires HTTPS, or HTTP on localhost.');
  return url;
}
export const toolId = (connection: McpConnection, index: number) => `mcp_${connection.id.replace(/[^a-zA-Z0-9]/g, '')}_${index}`;
async function connect(url: string, token: string, signal?: AbortSignal) {
  const endpoint = validateMcpUrl(url);
  const client = new Client({ name: 'htllm', version: '0.1.0' }, {
    jsonSchemaValidator: schemaValidator,
    versionNegotiation: { mode: 'auto', probe: { maxRetries: 0 } },
  });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'error' },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
    onInsufficientScope: 'throw',
  });
  const abort = () => { void client.close(); };
  signal?.throwIfAborted(); signal?.addEventListener('abort', abort, { once: true });
  try { await client.connect(transport, { timeout: 15000 }); }
  catch { await client.close().catch(() => {}); signal?.removeEventListener('abort', abort); throw new Error('MCP connection failed. Check endpoint, token, server origin/CORS settings, and network access. OAuth is not supported.'); }
  return { client, close: async () => { signal?.removeEventListener('abort', abort); await client.close(); } };
}
async function discover(client: Client): Promise<McpConnection['tools']> {
  const tools: McpConnection['tools'] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    for (const tool of page.tools) {
      if (tools.length >= 256) throw new Error('Server exposes too many tools for v1.');
      schemaValidator.getValidator(tool.inputSchema as Parameters<typeof schemaValidator.getValidator>[0]);
      tools.push({ name: tool.name, description: tool.description ?? tool.name, parameters: tool.inputSchema, readOnlyHint: tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true });
    }
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('Server returned a repeated pagination cursor.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return tools;
}
export async function inspectMcp(url: string, token: string): Promise<McpConnection['tools']> {
  const connection = await connect(url, token);
  try {
    const tools = await discover(connection.client);
    if (token && JSON.stringify(tools).includes(token)) throw new Error('The server returned credential material in tool metadata. Connection was not saved.');
    return tools;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool discovery failed.';
    throw new Error(token ? message.replaceAll(token, '[credential redacted]') : message);
  } finally { await connection.close(); }
}
export async function externalTools(enabledIds: string[], signal: AbortSignal): Promise<{ tools: ExecutableTool[]; close: () => Promise<void> }> {
  const tools: ExecutableTool[] = []; const closes: (() => Promise<void>)[] = [];
  const close = async () => { await Promise.allSettled(closes.map((fn) => fn())); };
  try {
    for (const server of await listMcpConnections()) {
      const selected = server.tools.map((tool, index) => ({ tool, index })).filter(({ index }) => enabledIds.includes(toolId(server, index)));
      if (!selected.length) continue;
      const token = await getKey(`mcp:${server.id}`) ?? '';
      const connection = await connect(server.url, token, signal); closes.push(connection.close);
      const current = await discover(connection.client);
      for (const { tool, index } of selected) {
        const live = current.find((candidate) => candidate.name === tool.name);
        if (JSON.stringify(live) !== JSON.stringify(tool)) {
          clearToolTrust();
          throw new Error(`Tools changed on ${server.name}. Refresh the connection and review selections.`);
        }
        tools.push({ ...tool, name: toolId(server, index), displayName: tool.name, server: server.name,
          fingerprint: JSON.stringify([server.id, server.url, tool]),
          execute: async (args, callSignal) => {
            try {
              const result = await connection.client.callTool({ name: tool.name, arguments: args }, { signal: callSignal, timeout: 60000 });
              if (result.isError) throw new Error('Tool reported an error');
              const parts = (result.content ?? []).map((item) => item.type === 'text' ? item.text : `[Unsupported ${item.type} content; not fetched]`);
              if (result.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
              const text = parts.join('\n');
              return { text: token ? text.replaceAll(token, '[credential redacted]') : text };
            } catch { throw new Error('MCP call failed; its external outcome may be unknown. Check the service before retrying.'); }
          },
        });
      }
    }
    if (tools.length !== enabledIds.length) throw new Error('A selected external tool is unavailable. Review tool selections.');
    return { tools, close };
  } catch (error) { await close(); throw error; }
}
