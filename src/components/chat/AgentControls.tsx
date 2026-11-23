import { useEffect, useRef, useState } from 'react';
import { Wrench, Settings2, FileText, Pencil } from 'lucide-react';
import type { Thread, McpConnection } from '../../providers/types';
import { listMcpConnections } from '../../data/mcp';
import { toolId } from '../../services/mcp';
import { Modal } from '../ui/Modal';
import { Switch } from '../ui/Switch';
import { ToolApproval } from './ToolApproval';
import type { LibraryWithStats } from '../../hooks/useKnowledge';
import { LibraryPickerModal } from '../knowledge/LibraryPickerModal';

export function AgentControls({ thread, libraryId, libraries, onSelectLibrary, onNewLibrary, capable, unavailableReason, busy, onChange: saveChange, onManageConnections }: {
  thread: Thread; libraryId: string | null; capable: boolean; unavailableReason?: string; busy: boolean;
  libraries: LibraryWithStats[]; onSelectLibrary: (id: string | null) => void; onNewLibrary: () => void;
  onChange: (patch: Partial<Thread>) => void; onManageConnections: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<'documents' | 'external'>('documents');
  // True after a tool-selection change switched Tools off, until the user
  // turns it back on or reopens the panel.
  const [reconfirm, setReconfirm] = useState(false);
  const automaticRagEnabled = thread.automaticRagEnabled ?? !thread.agentEnabled;
  // Freeze the legacy default before changing Tools, so the controls are independent.
  const onChange = (patch: Partial<Thread>) => saveChange({ automaticRagEnabled, ...patch });
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
  useEffect(() => { setOpen(false); setPickerOpen(false); }, [thread.id]);
  useEffect(() => { if (!open) setReconfirm(false); }, [open]);
  const enabled = thread.enabledToolIds ?? [];
  const available = connections.flatMap((connection) => connection.tools.map((_, index) => toolId(connection, index)));
  const selectedCount = enabled.filter((id) => available.includes(id)).length;
  const count = selectedCount + 3;
  const reason = !capable ? unavailableReason ?? 'Tools need an HTTP model that supports tool calling.' : '';
  const library = libraries.find(({ lib }) => lib.id === libraryId)?.lib;
  const sectionTitle = 'text-[10px] uppercase tracking-widest text-mute';
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const toggleTool = (id: string, checked: boolean) => {
    // Changing the tool set re-confirms Tools: it turns off until the user
    // switches it back on, so a new external tool is never enabled silently.
    if (thread.agentEnabled) setReconfirm(true);
    onChange({ enabledToolIds: checked ? [...enabled, id] : enabled.filter((value) => value !== id), agentEnabled: false });
  };
  const chip = 'inline-flex items-center gap-1 px-1.5 py-0.5 border transition-colors focus-visible:outline focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed';
  return <>
    <button aria-label={`Tools: ${thread.agentEnabled ? 'on' : 'off'} (${count} available)`} aria-haspopup="dialog" onClick={() => setOpen(true)} className={`${chip} ${thread.agentEnabled ? 'border-accent/60 text-accent bg-accent/10' : 'border-line text-mute hover:text-text'}`}>
      <Wrench size={11} /> tools: {thread.agentEnabled ? 'on' : 'off'} <span className="text-mute">· {count}</span>{libraryId && automaticRagEnabled && <span className="text-accent">· RAG</span>}
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="Tools for this chat" subtitle="Applies from your next message" width="max-w-xl">
      <div className="font-mono text-[11px]">
        {/* Master switch: the one place Tools is turned on or off. */}
        <div className="flex items-start gap-3 px-4 py-4 border-b border-line">
          <Wrench size={14} className="mt-0.5 shrink-0 text-mute" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-text">Tools</div>
            <p className="mt-1 text-mute leading-relaxed">Let the model call the document and external tools below while it answers.</p>
            {reason && <p className="mt-1 text-warn" role="status">{reason}</p>}
          </div>
          <Switch label="Use tools" checked={!!thread.agentEnabled} disabled={busy || (!!reason && !thread.agentEnabled)} onChange={(next) => { setReconfirm(false); onChange({ agentEnabled: next }); }} />
        </div>
        <div className="flex gap-5 px-4 border-b border-line" role="tablist" aria-label="Tool categories">
          {(['documents', 'external'] as const).map((value) => <button key={value} role="tab" aria-selected={tab === value} id={`tools-tab-${value}`} aria-controls={`tools-panel-${value}`} onClick={() => setTab(value)} className={`-mb-px py-2.5 border-b-2 transition-colors focus-visible:outline focus-visible:outline-accent ${tab === value ? 'border-accent text-text' : 'border-transparent text-mute hover:text-text'}`}>{value === 'documents' ? 'Documents' : 'External tools'}</button>)}
        </div>
        <div className="p-4 min-h-[320px]">
        {tab === 'documents' && <section role="tabpanel" id="tools-panel-documents" aria-labelledby="tools-tab-documents" className="space-y-5">
          <div className="space-y-2">
            <h3 className={sectionTitle}>Knowledge library</h3>
            <button aria-label="Choose knowledge library" aria-haspopup="dialog" disabled={busy} onClick={() => setPickerOpen(true)} className="w-full flex items-center justify-between gap-2 bg-surface border border-line hover:border-accent/40 px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed">
              <span className="min-w-0 truncate text-text">{library?.name ?? 'None — no document access'}</span><Pencil size={12} className="text-mute shrink-0" />
            </button>
            {libraryId && !library?.embeddingModelId && <p className="text-warn">This library has no embedding model yet. Pin one in Knowledge before it can be searched.</p>}
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-text">Automatic RAG</div>
              <p className="mt-1 text-mute leading-relaxed">Search the library once before each answer. Works with Tools on or off.</p>
            </div>
            <Switch label="Automatic RAG" checked={!!libraryId && automaticRagEnabled} disabled={busy || !libraryId} onChange={() => onChange({ automaticRagEnabled: !automaticRagEnabled })} />
          </div>
          <div className="space-y-2">
            <h3 className={sectionTitle}>Built-in document tools</h3>
            <ul className="border border-line divide-y divide-line">
              {([['list_documents', 'List files in the library'], ['search_knowledge', 'Find relevant passages'], ['read_document', 'Read a file, page by page']] as const).map(([name, description]) => (
                <li key={name} className="flex gap-3 px-3 py-2"><code className="w-36 shrink-0 text-text">{name}</code><span className="text-mute">{description}</span></li>
              ))}
            </ul>
            <p className="flex items-center gap-1.5 text-mute"><FileText size={12} className="shrink-0" />
              {libraryId ? <span>3 built-in read tools available</span> : <><span>No library selected</span><span>· these tools return no evidence.</span></>}
            </p>
          </div>
        </section>}
        {tab === 'external' && <section role="tabpanel" id="tools-panel-external" aria-labelledby="tools-tab-external" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className={sectionTitle}>MCP tools · {selectedCount} selected</h3>
            <button onClick={() => { setOpen(false); onManageConnections(); }} className="inline-flex items-center gap-1 text-mute hover:text-text transition-colors"><Settings2 size={12} /> Manage connections</button>
          </div>
          {!connections.length && <p className="border border-dashed border-line p-4 text-mute">No connections yet. Add an MCP server under Manage connections.</p>}
          {connections.map((connection) => <div key={connection.id} className="border border-line">
            <div className="flex items-baseline justify-between gap-2 px-3 py-2 border-b border-line bg-surface"><span className="min-w-0 truncate text-text">{connection.name}</span><span className="shrink-0 text-mute">{plural(connection.tools.length, 'tool')}</span></div>
            {!connection.tools.length && <p className="p-3 text-mute">No tools discovered.</p>}
            {connection.tools.map((tool, index) => { const id = toolId(connection, index); return <label className="flex items-start gap-2.5 px-3 py-2.5 border-b last:border-b-0 border-line cursor-pointer hover:bg-surface/60" key={id}>
              <input type="checkbox" className="accent-accent mt-0.5 [color-scheme:dark]" disabled={busy} checked={enabled.includes(id)} onChange={(e) => toggleTool(id, e.target.checked)} />
              <span className="min-w-0"><span className="text-text break-all">{tool.name}</span>{tool.description && <span className="block text-mute mt-0.5 break-words">{tool.description}</span>}</span>
            </label>; })}
          </div>)}
          {reconfirm && !thread.agentEnabled && <p role="status" className="border border-warn/40 bg-warn/5 p-2.5 text-warn">Selection changed, so Tools turned off. Turn it back on above to use the new set.</p>}
          {enabled.some((id) => !available.includes(id)) && <p className="text-warn">Some saved selections are no longer available. Select tools again after a connection refresh.</p>}
          <p className="text-mute leading-relaxed">Every external call asks for approval first.{!(reconfirm && !thread.agentEnabled) && ' Changing the selection turns Tools off until you turn it back on.'}</p>
          {error && <p role="alert" className="text-err">{error}</p>}
        </section>}
        </div>
      </div>
    </Modal>
    <LibraryPickerModal open={open && pickerOpen} onClose={() => setPickerOpen(false)} libraries={libraries} activeLibraryId={libraryId} allowNone title="Knowledge for this chat" noneLabel="None — no document access" onSelect={onSelectLibrary} onNewLibrary={() => { setPickerOpen(false); setOpen(false); onNewLibrary(); }} />
    <ToolApproval />
  </>;
}
