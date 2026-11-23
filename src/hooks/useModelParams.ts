import { useState, useEffect, useCallback } from 'react';
import type { ModelParams, Thread } from '../providers/types';
import { getSetting, setSetting, DEFAULT_MODEL_PARAMS } from '../data/settings';

export function useModelParams(thread: Thread | null) {
  const [globalDefaults, setGlobalDefaultsState] = useState<ModelParams>(DEFAULT_MODEL_PARAMS);

  useEffect(() => {
    getSetting<Partial<ModelParams>>('defaultModelParams').then((saved) => {
      if (saved) setGlobalDefaultsState({ ...DEFAULT_MODEL_PARAMS, ...saved });
    });
  }, []);

  const params: ModelParams = {
    ...globalDefaults,
    ...(thread?.modelParams ?? {}),
  };

  const setGlobalDefaults = useCallback(
    async (patch: Partial<ModelParams>) => {
      const newDefaults = { ...globalDefaults, ...patch };
      setGlobalDefaultsState(newDefaults);
      await setSetting('defaultModelParams', newDefaults);
    },
    [globalDefaults],
  );

  return { params, globalDefaults, setGlobalDefaults };
}
