import type { ThreadMode } from '../providers/types';
import { getSetting, setSetting } from './settings';

/** D-21: each mode remembers the last model used in it. */
const KEY = 'modeDefaultModels';

export type ModeDefaults = Partial<Record<ThreadMode, { providerId: string; modelId: string }>>;

export async function getModeDefaults(): Promise<ModeDefaults> {
  const value = await getSetting<ModeDefaults>(KEY);
  return value && typeof value === 'object' ? value : {};
}

export async function setModeDefault(mode: ThreadMode, providerId: string, modelId: string): Promise<void> {
  await setSetting(KEY, { ...(await getModeDefaults()), [mode]: { providerId, modelId } });
}

/** New chats open in the mode the user last picked on an empty chat (default Chat). */
const LAST_MODE_KEY = 'lastThreadMode';

export async function getLastMode(): Promise<ThreadMode> {
  return (await getSetting<ThreadMode>(LAST_MODE_KEY)) === 'workspace' ? 'workspace' : 'chat';
}

export async function setLastMode(mode: ThreadMode): Promise<void> {
  await setSetting(LAST_MODE_KEY, mode);
}
