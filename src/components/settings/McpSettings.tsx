import { useEffect, useState } from 'react';
import { Plug, RefreshCw } from 'lucide-react';
import type { McpConnection } from '../../providers/types';
import { listMcpConnections, saveMcpConnection, deleteMcpConnection } from '../../data/mcp';
import { getKey } from '../../data/keys';
import { inspectMcp } from '../../services/mcp';
import { clearToolTrust } from '../../services/approvals';

export function McpSettings({ busy = false }: { busy?: boolean }) {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [token, setToken] = useState('');
  const [error, setError] = useState(''); const [working, setWorking] = useState(false);
  const [tested, setTested] = useState<string[]>([]);
  const reload = async () => { setConnections(await listMcpConnections()); window.dispatchEvent(new Event('mcp-connections-changed')); };
  useEffect(() => { void listMcpConnections().then(setConnections).catch(() => setError('Could not load connections. Reopen settings to retry.')); }, []);
  const run = async (action: () => Promise<void>) => {
    setWorking(true); setError('');
    try { await action(); await reload(); } catch (err) { setError(err instanceof Error ? err.message : 'Connection failed'); }
    finally { setWorking(false); }
  };
  const disabled = working || busy;
  const button = 'inline-flex items-center gap-1.5 border border-line px-2.5 py-1.5 text-mute hover:text-text hover:border-line-hi disabled:opacity-40 disabled:cursor-not-allowed';
  const input = 'w-full min-w-0 bg-bg border border-line px-3 py-2 text-text focus:border-accent/60 focus:outline-none';
  return <div className="p-4 space-y-5 font-mono text-[11px]">
    <div className="space-y-2"><h3 className="flex items-center gap-2 text-text text-sm"><Plug size={16} /> Tools & connections</h3>
      <p className="text-mute leading-relaxed">Connections are shared across chats. Adding a server does not enable its tools: choose them using the Tools button in each chat.</p>
      {busy && <p className="text-warn">Stop the current response before changing connections.</p>}
    </div>
    <div className="space-y-3">
      {!connections.length && <p className="p-4 border border-dashed border-line text-mute">No MCP servers connected.</p>}
      {connections.map((connection) => <section key={connection.id} className="border border-line bg-surface p-3 space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-text break-all">{connection.name}</strong><span className={tested.includes(connection.id) ? 'text-ok' : 'text-mute'}>{tested.includes(connection.id) ? 'connection tested' : 'saved · not tested this session'}</span></div>
        <p className="text-mute break-all">{connection.url}</p>
        <details><summary className="text-accent cursor-pointer">{connection.tools.length} discovered tools</summary><ul className="mt-2 space-y-2 text-mute">{connection.tools.map((tool) => <li key={tool.name} className="break-words"><span className="text-text">{tool.name}</span>{tool.description && <p className="mt-0.5">{tool.description}</p>}</li>)}</ul></details>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={disabled} onClick={() => void run(async () => {
            clearToolTrust(); const credential = await getKey(`mcp:${connection.id}`) ?? '';
            const tools = await inspectMcp(connection.url, credential);
            // Fresh namespace prevents saved selections from rebinding to changed tools.
            const id = crypto.randomUUID(); await saveMcpConnection({ ...connection, id, tools }, credential);
            await deleteMcpConnection(connection.id); setTested((old) => [...old, id]);
          })}><RefreshCw size={12} /> Refresh tools</button>
          <button className={`${button} hover:text-err`} disabled={disabled} onClick={() => void run(async () => { clearToolTrust(); await deleteMcpConnection(connection.id); })}>Disconnect</button>
        </div>
        <p className="text-mute text-[10px]">Refreshing invalidates previous tool selections and session trust. Select tools again in each chat.</p>
      </section>)}
    </div>
    <form className="border border-line p-4 space-y-3" onSubmit={(event) => { event.preventDefault(); if (disabled || !url.trim()) return; void run(async () => {
      const tools = await inspectMcp(url.trim(), token); const id = crypto.randomUUID();
      await saveMcpConnection({ id, name: name.trim() || new URL(url.trim()).hostname, url: url.trim(), tools }, token);
      clearToolTrust(); setTested((old) => [...old, id]); setToken(''); setName(''); setUrl('');
    }); }}>
      <h3 className="text-[10px] uppercase tracking-widest text-mute">Add MCP connection</h3>
      <label className="block space-y-1 text-mute"><span>Connection name</span><input aria-label="MCP name" disabled={disabled} className={input} placeholder="My tool server" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="block space-y-1 text-mute"><span>Streamable HTTP endpoint</span><input aria-label="MCP endpoint" aria-describedby="mcp-cors-note" disabled={disabled} className={input} placeholder="https://server/mcp" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <p id="mcp-cors-note" className="text-warn text-[10px] leading-relaxed">CORS required for cross-origin connections: configure the MCP server to allow this app's origin{typeof window !== 'undefined' ? ` (${window.location.origin})` : ''}, including preflight requests and MCP headers. This also applies to localhost servers. A bearer token does not bypass CORS. The browser may report CORS and network failures similarly.</p>
      <label className="block space-y-1 text-mute"><span>Bearer token · optional</span><input aria-label="MCP bearer token" disabled={disabled} autoComplete="off" type="password" className={input} value={token} onChange={(e) => setToken(e.target.value)} /></label>
      <p className="text-mute text-[10px] leading-relaxed">Tokens stay in this browser's credential store and are excluded from backups and tool history.</p>
      <button type="submit" disabled={disabled || !url.trim()} className={`${button} border-accent/50 text-accent hover:bg-accent/10`}>{working ? 'Connecting…' : 'Test & add MCP'}</button>
    </form>
    {error && <p role="alert" className="border border-err/40 bg-err/5 p-3 text-err break-words">{error}</p>}
    <p className="text-mute leading-relaxed">HTTPS or explicitly configured localhost endpoints only. OAuth, stdio processes, and legacy SSE transport are not supported.</p>
  </div>;
}
