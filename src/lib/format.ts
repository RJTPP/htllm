export function fmtMB(mb: number | null | undefined): string {
  if (mb == null) return '—';
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function fmtBytes(b: number | null | undefined): string {
  if (b == null) return '—';
  const GB = 1024 ** 3;
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  const MB = 1024 ** 2;
  return `${(b / MB).toFixed(0)} MB`;
}

export function shortenModelId(id: string): string {
  return id.replace(/-MLC$/, '').replace(/-q\df\d+_\d+/, '');
}

export function fmtRelativeTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    undefined,
    sameYear
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'short', day: 'numeric' },
  );
}
