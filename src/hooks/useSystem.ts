import { useState, useEffect } from 'react';
import type { SystemInfo } from '../providers/types';
import { detectSystem } from '../lib/system-detect';

export function useSystem() {
  const [system, setSystem] = useState<SystemInfo | null>(null);

  useEffect(() => {
    detectSystem().then(setSystem);
  }, []);

  return system;
}
