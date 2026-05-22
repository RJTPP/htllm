import type { SystemInfo } from '../providers/types';

export async function detectSystem(): Promise<SystemInfo> {
  const info: SystemInfo = {
    webgpu: 'gpu' in navigator,
    deviceMemoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
    cores: navigator.hardwareConcurrency ?? null,
    gpu: null,
    storage: null,
    connection: null,
  };

  if (info.webgpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        info.gpu = {
          info: String(adapter.info ?? ''),
          maxBufferSize: adapter.limits.maxBufferSize,
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        };
      }
    } catch {
      // WebGPU adapter request failed — leave gpu as null
    }
  }

  try {
    const est = await navigator.storage.estimate();
    info.storage = {
      quota: est.quota ?? 0,
      usage: est.usage ?? 0,
      free: (est.quota ?? 0) - (est.usage ?? 0),
    };
  } catch {
    // Storage API not available
  }

  const conn = (navigator as unknown as { connection?: { effectiveType: string; downlink: number } }).connection;
  if (conn) {
    info.connection = {
      effectiveType: conn.effectiveType,
      downlink: conn.downlink,
    };
  }

  return info;
}
