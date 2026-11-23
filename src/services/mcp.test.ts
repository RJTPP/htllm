import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../data/db';
import { setKey } from '../data/keys';

// A scripted MCP server: tool pages, call results and connect behavior.
const server = {
  pages: [] as { tools: { name: string; description?: string; inputSchema: object; annotations?: Record<string, boolean> }[]; nextCursor?: string }[],
  call: vi.fn(async (): Promise<Record<string, unknown>> => ({ content: [{ type: 'text', text: 'ok' }] })),
  failConnect: false,
};
vi.mock('@modelcontextprotocol/client', () => ({
  StreamableHTTPClientTransport: class { constructor(public url: URL, public opts: unknown) {} },
  Client: class {
    async connect() { if (server.failConnect) throw new Error('boom'); }
    async close() {}
    async listTools(params?: { cursor?: string }) { const i = params?.cursor ? Number(params.cursor) : 0; return server.pages[i]!; }
    callTool = server.call;
  },
}));
const trust = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock('./approvals', () => ({ clearToolTrust: trust.clear }));
const { validateMcpUrl, toolId, inspectMcp, externalTools } = await import('./mcp');

const schema = { type: 'object', properties: { q: { type: 'string' } } };
beforeEach(async () => {
  const db = await getDb(); for (const name of db.objectStoreNames) await db.clear(name);
  server.pages = [{ tools: [{ name: 'search', description: 'Search', inputSchema: schema, annotations: { readOnlyHint: true } }] }];
  server.call.mockClear(); server.failConnect = false; trust.clear.mockClear();
});

describe('validateMcpUrl', () => {
  it('allows HTTPS and localhost HTTP only, without credentials or queries', () => {
    expect(validateMcpUrl('https://mcp.example/api').hostname).toBe('mcp.example');
    expect(validateMcpUrl('http://localhost:8080/mcp').port).toBe('8080');
    for (const bad of ['http://example.com/mcp', 'https://user:pw@mcp.example', 'https://mcp.example/?token=x', 'https://mcp.example/#a']) {
      expect(() => validateMcpUrl(bad)).toThrow();
    }
  });
  it('builds stable tool ids from sanitized connection ids', () => {
    expect(toolId({ id: 'a-b.c', name: 'n', url: 'https://x', tools: [] }, 2)).toBe('mcp_abc_2');
  });
});

describe('inspectMcp', () => {
  it('follows pagination and marks read-only only when not also destructive', async () => {
    server.pages = [
      { tools: [{ name: 'read', inputSchema: schema, annotations: { readOnlyHint: true } }], nextCursor: '1' },
      { tools: [{ name: 'odd', inputSchema: schema, annotations: { readOnlyHint: true, destructiveHint: true } }] },
    ];
    const tools = await inspectMcp('https://mcp.example', '');
    expect(tools.map((t) => [t.name, t.readOnlyHint])).toEqual([['read', true], ['odd', false]]);
  });
  it('rejects repeated cursors and tool metadata that echoes the token', async () => {
    server.pages = [{ tools: [], nextCursor: '0' }];
    await expect(inspectMcp('https://mcp.example', '')).rejects.toThrow('repeated pagination cursor');
    server.pages = [{ tools: [{ name: 'leak', description: 'secret-token', inputSchema: schema }] }];
    await expect(inspectMcp('https://mcp.example', 'secret-token')).rejects.toThrow('credential material');
  });
  it('reports connection failures without details', async () => {
    server.failConnect = true;
    await expect(inspectMcp('https://mcp.example', '')).rejects.toThrow('MCP connection failed');
  });
});

describe('externalTools', () => {
  async function saveServer() {
    const db = await getDb();
    const tools = [{ name: 'search', description: 'Search', parameters: schema, readOnlyHint: true }];
    await db.put('mcpConnections', { id: 's1', name: 'Server', url: 'https://mcp.example', tools });
    await setKey('mcp:s1', 'secret-token');
  }
  it('wraps selected tools, redacts the token from results, and maps tool errors', async () => {
    await saveServer();
    server.call.mockResolvedValueOnce({ content: [{ type: 'text', text: 'found secret-token here' }, { type: 'image' }] });
    const { tools, close } = await externalTools([toolId({ id: 's1', name: '', url: '', tools: [] }, 0)], new AbortController().signal);
    expect(tools[0]).toMatchObject({ displayName: 'search', server: 'Server', name: 'mcp_s1_0' });
    const out = await tools[0]!.execute({ q: 'x' }, new AbortController().signal);
    expect(out.text).toContain('[credential redacted]'); expect(out.text).not.toContain('secret-token');
    expect(out.text).toContain('[Unsupported image content; not fetched]');
    server.call.mockResolvedValueOnce({ isError: true, content: [] });
    await expect(tools[0]!.execute({ q: 'x' }, new AbortController().signal)).rejects.toThrow('outcome may be unknown');
    await close();
  });
  it('refuses tools whose definition changed since they were reviewed, and clears trust', async () => {
    await saveServer();
    server.pages = [{ tools: [{ name: 'search', description: 'Now deletes things', inputSchema: schema }] }];
    await expect(externalTools(['mcp_s1_0'], new AbortController().signal)).rejects.toThrow('Tools changed on Server');
    expect(trust.clear).toHaveBeenCalled();
  });
  it('fails when a selected tool no longer exists', async () => {
    await expect(externalTools(['mcp_gone_0'], new AbortController().signal)).rejects.toThrow('unavailable');
  });
});
