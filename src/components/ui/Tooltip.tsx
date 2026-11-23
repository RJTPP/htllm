import type { ReactNode } from 'react';

type TooltipSide = 'top' | 'bottom';

/**
 * Lightweight CSS-only hover tooltip. Wraps any element and shows a
 * positioned label on hover/focus — no JS state, no portal.
 */
export function Tooltip({
  label,
  side = 'top',
  children,
}: {
  label: string;
  side?: TooltipSide;
  children: ReactNode;
}) {
  const pos =
    side === 'top'
      ? 'bottom-full mb-1.5'
      : 'top-full mt-1.5';

  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${pos} z-50 px-2 py-1 whitespace-nowrap font-mono text-[10px] leading-tight text-text bg-surface2 border border-line opacity-0 group-hover/tip:opacity-100 transition-opacity duration-100`}
      >
        {label}
      </span>
    </span>
  );
}
