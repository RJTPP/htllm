import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Eye, TriangleAlert } from 'lucide-react';
import { getApproval, subscribeApprovals } from '../../services/approvals';
export function ToolApproval() {
  const request = useSyncExternalStore(subscribeApprovals, getApproval, () => null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!request) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); request.resolve('deny'); }
      if (event.key === 'Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll('button') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [request]);
  if (!request) return null;
  const button = 'border px-3 py-1.5 transition-colors focus-visible:outline focus-visible:outline-accent';
  // Deny stays first in the DOM: it receives initial focus and is the
  // keyboard default. Clicking the backdrop deliberately does nothing.
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="Approve external tool" className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/70" />
    <div className="relative w-full max-w-xl bg-bg border border-line font-mono text-[11px]">
      <div className="px-4 py-3 border-b border-line">
        <h2 className="text-sm text-text">Allow external tool?</h2>
        <p className="mt-0.5 text-mute break-words"><span className="text-text">{request.event.tool}</span> on {request.event.server}</p>
      </div>
      <div className="p-4 space-y-4">
        {request.readOnlyHint
          ? <p className="flex items-start gap-2 text-mute"><Eye size={13} className="mt-px shrink-0" />The server labels this tool read-only. Labels are not verified, so trust it only if you know the server.</p>
          : <p className="flex items-start gap-2 border border-warn/40 bg-warn/5 p-2.5 text-warn"><TriangleAlert size={13} className="mt-px shrink-0" />This call may change data on the external service.</p>}
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-mute">Arguments sent to this service</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-surface border border-line p-3 text-text">{prettyArguments(request.event.arguments)}</pre>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-line">
        <button className={`${button} border-line text-text hover:border-line-hi`} onClick={() => request.resolve('deny')}>Deny</button>
        <button className={`${button} border-accent/60 text-accent hover:bg-accent/10`} onClick={() => request.resolve('allow')}>Allow once</button>
        {request.readOnlyHint && <button className={`${button} border-line text-mute hover:text-text`} onClick={() => request.resolve('trust')}>Trust this read tool for this session</button>}
        <span className="ml-auto text-mute">esc to deny</span>
      </div>
    </div>
  </div>, document.body);
}

/** Pretty-print JSON arguments for review; fall back to the raw string. */
function prettyArguments(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}
