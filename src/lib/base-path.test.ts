import { expect, it } from 'vitest';
import { BASE_PATH, appPath } from './base-path';

it('joins page paths under the base without doubling slashes', () => {
  expect(BASE_PATH).toBe('/');
  expect(appPath('app')).toBe('/app');
  expect(appPath()).toBe('/');
  expect(appPath('/app', '/htllm/')).toBe('/htllm/app');
  expect(appPath('', '/htllm/')).toBe('/htllm/');
});
