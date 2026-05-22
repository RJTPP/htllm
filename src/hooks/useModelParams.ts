import { useState, useEffect, useCallback } from 'react';
import type { ModelParams, Thread } from '../providers/types';
import { getSetting, setSetting, DEFAULT_MODEL_PARAMS } from '../data/settings';
import { updateThread } from '../data/threads';

export function useModelParams(thread: Thread | null) {
  const [globalDefaults, setGlobalDefaultsState] = useState<ModelParams>(DEFAULT_MODEL_PARAMS);

  useEffect(() => {
    getSetting<ModelParams>('defaultModelParams').then((saved) => {
      if (saved) setGlobalDefaultsState(saved);
    });
  }, []);

  const params: ModelParams = {
    ...globalDefaults,
    ...(thread?.modelParams ?? {}),
  };

  const setThreadParams = useCallback(
    async (patch: Partial<ModelParams>) => {
      if (!thread) return;
      const newParams = { ...(thread.modelParams ?? globalDefaults), ...patch };
      await updateThread(thread.id, { modelParams: newParams });
    },
    [thread, globalDefaults],
  );

  const setGlobalDefaults = useCallback(
    async (patch: Partial<ModelParams>) => {
      const newDefaults = { ...globalDefaults, ...patch };
      setGlobalDefaultsState(newDefaults);
      await setSetting('defaultModelParams', newDefaults);
    },
    [globalDefaults],
  );

  return { params, globalDefaults, setThreadParams, setGlobalDefaults };
}
