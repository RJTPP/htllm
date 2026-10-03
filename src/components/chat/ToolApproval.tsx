import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
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
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="Approve external tool" className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
    <div className="bg-surface border border-line p-5 max-w-xl w-full space-y-3 font-mono text-[11px]">
      <h2 className="text-text text-sm">Allow external tool?</h2>
      <p className="text-accent break-words">{request.event.server} · {request.event.tool}</p>
      <p className="text-mute text-sm">These arguments will be sent to this service. This call may change external data.</p>
      <pre className="overflow-auto max-h-64 text-xs whitespace-pre-wrap break-all bg-bg border border-line p-3">{request.event.arguments}</pre>
      <div className="flex flex-wrap gap-2">
        <button className="border border-line px-3 py-2 hover:border-line-hi focus-visible:outline focus-visible:outline-accent" onClick={() => request.resolve('deny')}>Deny</button>
        <button className="border border-accent/50 text-accent px-3 py-2 hover:bg-accent/10" onClick={() => request.resolve('allow')}>Allow once</button>
        {request.readOnlyHint && <button className="border border-line text-mute px-3 py-2 hover:text-text" onClick={() => request.resolve('trust')}>Trust this read tool for this session</button>}
      </div>
      {request.readOnlyHint && <p className="text-xs text-mute">The server labels this as read-only. Trust it only if you know the server and tool.</p>}
    </div>
  </div>, document.body);
}
