import type { SystemInfo } from '../../providers/types';
import { Badge } from '../ui/Badge';
import { Dot } from '../ui/Dot';
import { fmtBytes } from '../../lib/format';

export function SystemStats({
  system,
  compact = false,
}: {
  system: SystemInfo;
  compact?: boolean;
}) {
  const mem = system.deviceMemoryGB;
  const ramTone = mem == null ? 'neutral' : mem >= 8 ? 'ok' : mem >= 4 ? 'warn' : 'err';
  const free = system.storage?.free ?? null;
  const storTone = free == null ? 'neutral' : free > 2 * 1024 ** 3 ? 'ok' : 'warn';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={system.webgpu ? 'ok' : 'err'}>
        <Dot tone={system.webgpu ? 'ok' : 'err'} /> {compact ? 'GPU' : 'WebGPU'}{' '}
        {system.webgpu ? 'ok' : 'absent'}
      </Badge>
      <Badge tone={ramTone}>RAM {mem == null ? '—' : `≥${mem} GB`}</Badge>
      {!compact && system.cores != null && <Badge tone="neutral">CPU {system.cores}c</Badge>}
      {!compact && system.gpu && (
        <Badge tone="neutral">buf {fmtBytes(system.gpu.maxBufferSize)}</Badge>
      )}
      {free != null && <Badge tone={storTone}>free {fmtBytes(free)}</Badge>}
      {!compact && system.connection && (
        <Badge tone="neutral">net {system.connection.effectiveType}</Badge>
      )}
    </div>
  );
}
