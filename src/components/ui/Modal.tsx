import { useEffect, useState, useRef, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-2xl',
  stableHeight = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: string;
  /** Pin the modal to a fixed height so it doesn't resize as content
   *  changes (e.g. switching tabs). Content scrolls internally. */
  stableHeight?: boolean;
}) {
  // SSR-safe portal target: document.body is undefined during Astro's
  // server render, so defer to a state set on mount.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!open || !portalTarget) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (!dialog.current?.contains(document.activeElement)) return;
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key === 'Tab') {
        const elements = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]')).filter((el) => el.getClientRects().length > 0);
        if (!elements.length) { e.preventDefault(); return; }
        const index = elements.indexOf(document.activeElement as HTMLElement);
        if (index === -1 || (e.shiftKey && index === 0) || (!e.shiftKey && index === elements.length - 1)) {
          e.preventDefault(); elements[e.shiftKey ? elements.length - 1 : 0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); if (previous?.isConnected) previous.focus(); };
  }, [open, portalTarget]);

  if (!open || !portalTarget) return null;

  // Render through a portal to document.body so `position: fixed` is
  // always relative to the viewport. Without this, a transformed
  // ancestor (the header's `reveal` animation uses `translateY`, which
  // establishes a containing block for fixed descendants) breaks
  // positioning and the modal renders relative to that ancestor instead.
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`relative z-10 w-full ${width} ${
          stableHeight ? 'h-[84vh]' : 'max-h-[84vh]'
        } flex flex-col bg-bg border border-line`}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-line">
          <div>
            <h2 id={titleId} className="font-mono text-sm text-text">{title}</h2>
            {subtitle && (
              <div className="font-mono text-[11px] text-mute mt-0.5">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-mute hover:text-text border border-line px-2 py-1"
          >
            esc
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>,
    portalTarget,
  );
}
