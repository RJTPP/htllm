import type { SystemInfo } from '../../providers/types';
import { Badge } from '../ui/Badge';
import { Dot } from '../ui/Dot';
import { fmtBytes } from '../../lib/format';

export function SystemRail({ system }: { system: SystemInfo | null }) {
  if (!system) {
    return (
      <div className="flex items-center gap-3 font-mono text-xs text-mute">
        <span className="animate-pulse-dot inline-block w-1.5 h-1.5 bg-accent rounded-full" />
        probing…
      </div>
    );
  }

  const webgpuTone = system.webgpu ? 'ok' : 'err';
  const ramTone = !system.deviceMemoryGB
    ? 'neutral'
    : system.deviceMemoryGB >= 8
      ? 'ok'
      : system.deviceMemoryGB >= 4
        ? 'warn'
        : 'err';
  const storageTone =
    system.storage && system.storage.free > 2 * 1024 ** 3 ? 'ok' : 'warn';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={webgpuTone}>
        <Dot tone={webgpuTone} /> WebGPU {system.webgpu ? 'ok' : 'absent'}
      </Badge>
      <Badge tone={ramTone}>
        RAM {system.deviceMemoryGB ? `≥${system.deviceMemoryGB} GB` : 'unknown'}
      </Badge>
      <Badge tone="neutral">CPU {system.cores ?? '?'}c</Badge>
      {system.gpu && (
        <Badge tone="neutral">buf {fmtBytes(system.gpu.maxBufferSize)}</Badge>
      )}
      {system.storage && (
        <Badge tone={storageTone}>free {fmtBytes(system.storage.free)}</Badge>
      )}
      {system.connection && (
        <Badge tone="neutral">
          net {system.connection.effectiveType}
          {system.connection.downlink ? ` · ${system.connection.downlink}Mbps` : ''}
        </Badge>
      )}
    </div>
  );
}
