import { useEffect, type ReactNode } from 'react';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${width} max-h-[84vh] flex flex-col bg-bg border border-line`}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-line">
          <div>
            <h2 className="font-mono text-sm text-text">{title}</h2>
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
    </div>
  );
}
