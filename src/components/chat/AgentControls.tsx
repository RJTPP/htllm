import { useEffect, useRef, useState } from 'react';
import { Bot, Wrench, Settings2, FileText } from 'lucide-react';
import type { Thread, McpConnection } from '../../providers/types';
import { listMcpConnections } from '../../data/mcp';
import { toolId } from '../../services/mcp';
import { Modal } from '../ui/Modal';
import { ToolApproval } from './ToolApproval';

export function AgentControls({ thread, libraryId, capable, busy, onChange, onManageConnections }: {
  thread: Thread; libraryId: string | null; capable: boolean; busy: boolean;
  onChange: (patch: Partial<Thread>) => void; onManageConnections: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [error, setError] = useState('');
  const current = useRef({ thread, onChange });
  current.current = { thread, onChange };
  useEffect(() => {
    let live = true;
    const refresh = () => { void listMcpConnections().then((items) => {
      if (!live) return;
      setConnections(items); setError('');
      const ids = new Set(items.flatMap((connection) => connection.tools.map((_, index) => toolId(connection, index))));
      const saved = current.current.thread.enabledToolIds ?? [];
      if (saved.some((id) => !ids.has(id))) current.current.onChange({ enabledToolIds: saved.filter((id) => ids.has(id)), agentEnabled: false });
    }).catch(() => { if (live) setError('Could not load connections. Reopen this panel to retry.'); }); };
    refresh(); window.addEventListener('mcp-connections-changed', refresh);
    return () => { live = false; window.removeEventListener('mcp-connections-changed', refresh); };
  }, [open, thread.id]);
  useEffect(() => { setOpen(false); }, [thread.id]);
  const enabled = thread.enabledToolIds ?? [];
  const available = connections.flatMap((connection) => connection.tools.map((_, index) => toolId(connection, index)));
  const selectedCount = enabled.filter((id) => available.includes(id)).length;
  const count = selectedCount + 3;
  const reason = !capable ? 'Tool use requires an HTTP model.' : '';
  const chip = 'inline-flex items-center gap-1 px-1.5 py-0.5 border transition-colors focus-visible:outline focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed';
  return <>
    <button aria-label={`Tools: ${thread.agentEnabled ? 'on' : 'off'} (${count} available)`} aria-haspopup="dialog" onClick={() => setOpen(true)} className={`${chip} ${thread.agentEnabled ? 'border-accent/60 text-accent bg-accent/10' : 'border-line text-mute hover:text-text'}`}>
      <Wrench size={11} /> tools: {thread.agentEnabled ? 'on' : 'off'} <span className="text-mute">· {count}</span>
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="Tools for this chat" subtitle="Selections apply to the next turn" width="max-w-xl">
      <div className="p-4 space-y-5 font-mono text-[11px]">
        <div className="border border-line bg-surface p-3 space-y-2">
          <div className="flex items-center gap-2 text-text"><Bot size={14} /> Model tool use <span className="ml-auto text-accent">{thread.agentEnabled ? 'on' : 'off'}</span></div>
          <p className="text-mute leading-relaxed">With tools on, the model chooses when to search documents or use selected tools. With tools off, a selected library uses one automatic retrieval pass.</p>
          {reason && <p className="text-warn" role="status">{reason}</p>}
          <button role="switch" aria-label="Use tools" aria-checked={!!thread.agentEnabled} disabled={busy || (!!reason && !thread.agentEnabled)} onClick={() => onChange({ agentEnabled: !thread.agentEnabled })} className="border border-accent/50 px-3 py-1.5 text-accent hover:bg-accent/10 disabled:opacity-40">Tools {thread.agentEnabled ? 'on' : 'off'}</button>
        </div>
        <section className="border-t border-line pt-4 space-y-2">
          <h3 className="text-[10px] uppercase tracking-widest text-mute">Document tools</h3>
          <div className="flex gap-2 text-text"><FileText size={14} />{libraryId ? '3 built-in read tools available' : 'No library selected'}</div>
          <p className="text-mute leading-relaxed">{libraryId ? 'List, search, and read only the selected library. Document reads run automatically.' : 'Tools can stay on. Document tools return no evidence until you select a library with Knowledge.'}</p>
        </section>
        <section className="border-t border-line pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[10px] uppercase tracking-widest text-mute">External tools · {selectedCount} selected</h3>
            <button onClick={() => { setOpen(false); onManageConnections(); }} className="inline-flex items-center gap-1 text-accent hover:underline"><Settings2 size={12} /> Manage connections</button>
          </div>
          {!connections.length && <p className="border border-dashed border-line p-3 text-mute">No MCP connections yet. Add a server in Settings → Tools & connections.</p>}
          {connections.map((connection) => <div key={connection.id} className="border border-line bg-surface">
            <div className="px-3 py-2 border-b border-line text-text">{connection.name}<span className="ml-2 text-mute">{connection.tools.length} tools</span></div>
            {!connection.tools.length && <p className="p-3 text-mute">No tools discovered.</p>}
            {connection.tools.map((tool, index) => { const id = toolId(connection, index); return <label className="flex items-start gap-2 p-3 border-b last:border-b-0 border-line cursor-pointer" key={id}>
              <input type="checkbox" className="accent-accent mt-0.5" disabled={busy} checked={enabled.includes(id)} onChange={(e) => onChange({ enabledToolIds: e.target.checked ? [...enabled, id] : enabled.filter((value) => value !== id), agentEnabled: false })} />
              <span className="min-w-0"><span className="text-text break-all">{tool.name}</span>{tool.description && <span className="block text-mute mt-1 break-words">{tool.description}</span>}</span>
            </label>; })}
          </div>)}
          {enabled.some((id) => !available.includes(id)) && <p className="text-warn">Some saved selections are unavailable. Select tools again after a connection refresh.</p>}
          <p className="text-mute leading-relaxed">External calls require approval. Session trust is offered only for selected read tools; writes and unknown actions always ask.</p>
          {error && <p role="alert" className="text-err">{error}</p>}
        </section>
      </div>
    </Modal>
    <ToolApproval />
  </>;
}
