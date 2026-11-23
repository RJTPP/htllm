import { expect, it } from 'vitest';
import { getLastMode, setLastMode } from './mode-defaults';

it('remembers the last picked mode, starting from Chat', async () => {
  expect(await getLastMode()).toBe('chat');
  await setLastMode('workspace');
  expect(await getLastMode()).toBe('workspace');
  await setLastMode('chat');
  expect(await getLastMode()).toBe('chat');
});
