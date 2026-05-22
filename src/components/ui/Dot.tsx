type Tone = 'mute' | 'ok' | 'warn' | 'err' | 'accent';

const colorClasses: Record<Tone, string> = {
  mute: 'bg-mute',
  ok: 'bg-ok',
  warn: 'bg-warn',
  err: 'bg-err',
  accent: 'bg-accent',
};

export function Dot({ tone = 'mute' }: { tone?: Tone }) {
  return <span className={`w-1.5 h-1.5 rounded-full ${colorClasses[tone]}`} />;
}
