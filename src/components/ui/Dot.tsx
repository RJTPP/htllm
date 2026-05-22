type DotTone = 'mute' | 'ok' | 'warn' | 'err' | 'accent';

const colors: Record<DotTone, string> = {
  mute: 'bg-mute',
  ok: 'bg-ok',
  warn: 'bg-warn',
  err: 'bg-err',
  accent: 'bg-accent',
};

export function Dot({ tone = 'mute', pulse = false }: { tone?: DotTone; pulse?: boolean }) {
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[tone]} ${pulse ? 'pulse-dot' : ''}`}
    />
  );
}
