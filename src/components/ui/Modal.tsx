import { useEffect, useCallback, type ReactNode } from 'react';

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col bg-bg border border-line overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="font-mono text-sm text-text">{title}</h2>
          <button
            onClick={onClose}
            className="font-mono text-xs text-mute hover:text-text px-2 py-1"
          >
            esc
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
