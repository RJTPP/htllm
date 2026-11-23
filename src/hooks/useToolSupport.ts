import { useCallback, useEffect, useState } from 'react';
import type { ChatProvider } from '../providers/types';
import { getToolOverrides, overrideKey, setToolOverride, type ToolOverrides } from '../data/tool-overrides';
import { resolveToolSupport, type ToolSupport } from '../lib/tool-support';

/** Whether the active model may use tools: provider capability, then the
 *  user's override, then what the server reports, else assumed (D-23). */
export function useToolSupport(provider: ChatProvider, modelId: string): {
  support: ToolSupport;
  overrides: ToolOverrides;
  setOverride: (providerId: string, modelId: string, value: boolean | undefined) => Promise<void>;
} {
  const [overrides, setOverrides] = useState<ToolOverrides>({});
  const [detected, setDetected] = useState<{ key: string; value: boolean | undefined } | null>(null);
  const key = overrideKey(provider.id, modelId);

  useEffect(() => { void getToolOverrides().then(setOverrides); }, []);
  useEffect(() => {
    let live = true;
    if (modelId && provider.detectToolSupport) {
      void provider.detectToolSupport(modelId).then((value) => { if (live) setDetected({ key, value }); });
    }
    return () => { live = false; };
  }, [provider, modelId, key]);

  const setOverride = useCallback(async (providerId: string, id: string, value: boolean | undefined) => {
    setOverrides(await setToolOverride(providerId, id, value));
  }, []);

  const support = resolveToolSupport(provider.capabilities.toolCalls, detected?.key === key ? detected.value : undefined, overrides[key]);
  return { support, overrides, setOverride };
}
