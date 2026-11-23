import { useEffect, useState } from 'react';
import type { ChatProvider } from '../providers/types';

/** The context window the server says it accepts for the active model, if it says. */
export function useServerContext(provider: ChatProvider, modelId: string): number | undefined {
  const [value, setValue] = useState<{ key: string; context: number | undefined } | null>(null);
  const key = `${provider.id}:${modelId}`;
  useEffect(() => {
    let live = true;
    if (modelId && provider.detectContextWindow) {
      void provider.detectContextWindow(modelId).then((context) => { if (live) setValue({ key, context }); }).catch(() => {});
    }
    return () => { live = false; };
  }, [provider, modelId, key]);
  return value?.key === key ? value.context : undefined;
}
