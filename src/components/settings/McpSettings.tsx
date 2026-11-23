import { useEffect, useState } from 'react';
import { ChevronRight, Info, Plug, RefreshCw } from 'lucide-react';
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
  const button = 'inline-flex items-center gap-1.5 border border-line px-2.5 py-1.5 text-mute hover:text-text hover:border-line-hi transition-colors focus-visible:outline focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed';
  const input = 'w-full min-w-0 bg-bg border border-line px-3 py-2 text-text placeholder:text-mute/60 focus:border-accent/60 focus:outline-none';
  const sectionTitle = 'text-[10px] uppercase tracking-widest text-mute';
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return <div className="p-4 space-y-6 font-mono text-[11px]">
    <div className="space-y-2"><h3 className="flex items-center gap-2 text-text text-sm"><Plug size={16} /> Tools & connections</h3>
      <p className="text-mute leading-relaxed">MCP servers connected over Streamable HTTP. Connections are shared by all chats; each chat picks the tools it may use from its Tools button.</p>
      {busy && <p className="text-warn">Stop the current response before changing connections.</p>}
    </div>
    <div className="space-y-2">
      <h4 className={sectionTitle}>Connected servers</h4>
      {!connections.length && <p className="p-4 border border-dashed border-line text-mute">No MCP servers connected.</p>}
      {connections.map((connection) => <section key={connection.id} className="border border-line">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 border-b border-line bg-surface">
          <strong className="min-w-0 font-normal text-text break-all">{connection.name}</strong>
          <span className={`inline-flex items-center gap-1.5 ${tested.includes(connection.id) ? 'text-ok' : 'text-mute'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 ${tested.includes(connection.id) ? 'bg-ok' : 'bg-mute'}`} />{tested.includes(connection.id) ? 'connection tested' : 'saved · not tested this session'}</span>
        </div>
        <div className="p-3 space-y-3">
        <p className="text-mute break-all">{connection.url}</p>
        <details className="group"><summary className="flex cursor-pointer list-none items-center gap-1.5 text-mute hover:text-text [&::-webkit-details-marker]:hidden"><ChevronRight size={12} className="transition-transform group-open:rotate-90" />{plural(connection.tools.length, 'discovered tool')}</summary><ul className="mt-2 ml-1.5 space-y-2 border-l border-line pl-3 text-mute">{connection.tools.map((tool) => <li key={tool.name} className="break-words"><span className="text-text">{tool.name}</span>{tool.description && <p className="mt-0.5">{tool.description}</p>}</li>)}</ul></details>
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
        <p className="text-mute text-[10px]">Refreshing re-reads the tool list and clears this server's selections and session trust in every chat.</p>
        </div>
      </section>)}
    </div>
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (disabled || !url.trim()) return; void run(async () => {
      const tools = await inspectMcp(url.trim(), token); const id = crypto.randomUUID();
      await saveMcpConnection({ id, name: name.trim() || new URL(url.trim()).hostname, url: url.trim(), tools }, token);
      clearToolTrust(); setTested((old) => [...old, id]); setToken(''); setName(''); setUrl('');
    }); }}>
      <h4 className={sectionTitle}>Add a server</h4>
      <div className="border border-line p-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <label className="block space-y-1 text-mute"><span>Name · optional</span><input aria-label="MCP name" disabled={disabled} className={input} placeholder="My tool server" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block space-y-1 text-mute"><span>Streamable HTTP endpoint</span><input aria-label="MCP endpoint" aria-describedby="mcp-cors-note" disabled={disabled} className={input} placeholder="https://server.example/mcp" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        </div>
        <p id="mcp-cors-note" className="flex items-start gap-2 text-mute text-[10px] leading-relaxed"><Info size={12} className="mt-px shrink-0" /><span>The server must allow this app's origin through CORS{typeof window !== 'undefined' && <>, <code className="text-text">{window.location.origin}</code></>}, including preflight requests and MCP headers. That applies to localhost servers too. A token does not bypass CORS, and a CORS failure can look like a network error.</span></p>
        <label className="block space-y-1 text-mute"><span>Bearer token · optional</span><input aria-label="MCP bearer token" disabled={disabled} autoComplete="off" type="password" className={input} value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <p className="text-mute text-[10px] leading-relaxed">Kept in this browser's credential store. Never included in backups or tool history.</p>
        <button type="submit" disabled={disabled || !url.trim()} className={`${button} border-accent/50 text-accent hover:bg-accent/10 hover:text-accent`}>{working ? 'Connecting…' : 'Test & add MCP'}</button>
      </div>
    </form>
    {error && <p role="alert" className="border border-err/40 bg-err/5 p-3 text-err break-words">{error}</p>}
    <p className="text-mute text-[10px] leading-relaxed">Supports HTTPS and explicit localhost endpoints. OAuth, stdio servers and the legacy SSE transport are not supported.</p>
  </div>;
}
