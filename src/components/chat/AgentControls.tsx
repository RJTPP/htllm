import { useEffect, useState } from 'react';
import type { Thread, McpConnection } from '../../providers/types';
import { listMcpConnections, saveMcpConnection, deleteMcpConnection } from '../../data/mcp';
import { inspectMcp, toolId } from '../../services/mcp';
import { clearToolTrust } from '../../services/approvals';
import { getKey } from '../../data/keys';
import { ToolApproval } from './ToolApproval';

export function AgentControls({ thread, libraryId, capable, busy, onChange }: {
  thread: Thread; libraryId: string | null; capable: boolean; busy: boolean;
  onChange: (patch: Partial<Thread>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [token, setToken] = useState('');
  const [error, setError] = useState(''); const [connecting, setConnecting] = useState(false);
  useEffect(() => { void listMcpConnections().then(setConnections); }, [open]);
  const key = `${thread.providerId}:${thread.modelId}`;
  const qualified = thread.toolModelKey === key;
  const enabled = thread.enabledToolIds ?? [];
  const reason = !capable ? 'Agent mode requires an HTTP model.' : !qualified ? 'Confirm model tool support in Tools settings.' : !libraryId && !enabled.length ? 'Select a library or external tools.' : '';
  const add = async () => {
    setConnecting(true); setError('');
    try {
      const tools = await inspectMcp(url, token);
      await saveMcpConnection({ id: crypto.randomUUID(), name: name.trim() || new URL(url).hostname, url, tools }, token);
      clearToolTrust(); setToken(''); setName(''); setUrl(''); setConnections(await listMcpConnections());
    } catch (err) { setError(err instanceof Error ? err.message : 'Connection failed'); }
    finally { setConnecting(false); }
  };
  return <div className="border-t border-line px-4 py-2 text-xs">
    <div className="flex items-center gap-3">
      <label title={reason}><input type="checkbox" checked={!!thread.agentEnabled} disabled={busy || (!!reason && !thread.agentEnabled)}
        onChange={(e) => onChange({ agentEnabled: e.target.checked })} /> Agent</label>
      <button onClick={() => setOpen(!open)}>Tools & connections</button>
      {reason && <span className="text-mute">{reason}</span>}
    </div>
    {open && <div className="space-y-3 py-3 max-h-72 overflow-auto">
      <p className="text-mute">Agent mode can search your selected library and use enabled external tools. External calls ask for approval.</p>
      <label className="block"><input type="checkbox" disabled={!capable || busy} checked={qualified}
        onChange={(e) => onChange({ toolModelKey: e.target.checked ? key : undefined, agentEnabled: false })} /> This model supports function/tool calling ({thread.modelId})</label>
      <p className="text-mute">This is a capability override, not a live compatibility test. Unsupported models can still use ordinary chat and RAG.</p>
      {connections.map((connection) => <div key={connection.id} className="border border-line p-2 space-y-1">
        <div className="flex gap-3"><strong>{connection.name}</strong><button disabled={busy || connecting} onClick={async () => {
          setConnecting(true); setError(''); clearToolTrust();
          try {
            const credential = await getKey(`mcp:${connection.id}`) ?? '';
            const tools = await inspectMcp(connection.url, credential);
            // Rotate the application namespace on rediscovery. A reordered tool
            // list must never rebind another conversation's saved index to a
            // different action; old selections become unavailable instead.
            await saveMcpConnection({ ...connection, id: crypto.randomUUID(), tools }, credential);
            await deleteMcpConnection(connection.id);
            onChange({ enabledToolIds: enabled.filter((id) => !connection.tools.some((_, index) => toolId(connection, index) === id)), agentEnabled: false });
            setConnections(await listMcpConnections());
          } catch (err) { setError(err instanceof Error ? err.message : 'Connection failed'); }
          finally { setConnecting(false); }
        }}>Refresh tools</button><button disabled={busy || connecting} onClick={async () => {
          await deleteMcpConnection(connection.id); clearToolTrust();
          onChange({ enabledToolIds: enabled.filter((id) => !connection.tools.some((_, index) => toolId(connection, index) === id)), agentEnabled: false });
          setConnections(await listMcpConnections());
        }}>Disconnect</button></div>
        {connection.tools.map((tool, index) => { const id = toolId(connection, index); return <label className="block" key={id}>
          <input type="checkbox" disabled={busy} checked={enabled.includes(id)} onChange={(e) => onChange({ enabledToolIds: e.target.checked ? [...enabled, id] : enabled.filter((value) => value !== id), agentEnabled: false })} /> {tool.name}
        </label>; })}
      </div>)}
      <div className="flex flex-wrap gap-2">
        <input aria-label="MCP name" className="bg-bg border border-line p-1" placeholder="Connection name" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="MCP endpoint" className="bg-bg border border-line p-1" placeholder="https://server/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input aria-label="MCP bearer token" autoComplete="off" type="password" className="bg-bg border border-line p-1" placeholder="Bearer token (optional)" value={token} onChange={(e) => setToken(e.target.value)} />
        <button disabled={connecting || busy || !url} onClick={() => void add()}>{connecting ? 'Connecting…' : 'Test & add MCP'}</button>
      </div>
      <p className="text-mute">Streamable HTTP only. The server must permit this browser origin. OAuth and launching stdio processes are not supported.</p>
      {error && <p role="alert" className="text-red-400">{error}</p>}
    </div>}
    <ToolApproval />
  </div>;
}
