import type { ReactNode } from 'react';

type BadgeTone = 'neutral' | 'ok' | 'warn' | 'err' | 'accent' | 'info';

const tones: Record<BadgeTone, string> = {
  neutral: 'border-line text-mute',
  ok: 'border-ok/40 text-ok bg-ok/5',
  warn: 'border-warn/40 text-warn bg-warn/5',
  err: 'border-err/40 text-err bg-err/5',
  accent: 'border-accent/40 text-accent bg-accent/5',
  info: 'border-info/40 text-info bg-info/5',
};

export function Badge({
  tone = 'neutral',
  mono = true,
  children,
}: {
  tone?: BadgeTone;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] border whitespace-nowrap ${tones[tone]} ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </span>
  );
}
