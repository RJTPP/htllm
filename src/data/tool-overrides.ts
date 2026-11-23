import { getSetting, setSetting } from './settings';

/** User overrides for per-model tool support, keyed `${providerId}:${modelId}`. */
const KEY = 'modelToolOverrides';

export type ToolOverrides = Record<string, boolean>;

export const overrideKey = (providerId: string, modelId: string) => `${providerId}:${modelId}`;

export async function getToolOverrides(): Promise<ToolOverrides> {
  const value = await getSetting<ToolOverrides>(KEY);
  return value && typeof value === 'object' ? value : {};
}

/** Set or clear (undefined) the override for one model. */
export async function setToolOverride(providerId: string, modelId: string, value: boolean | undefined): Promise<ToolOverrides> {
  const next = { ...(await getToolOverrides()) };
  const key = overrideKey(providerId, modelId);
  if (value === undefined) delete next[key];
  else next[key] = value;
  await setSetting(KEY, next);
  return next;
}
