import { defineConfig } from '@playwright/test';
// Tests navigate with relative paths ('app'), so they run under any base path.
// `pnpm test:browser:subpath` sets HTLLM_BASE=/htllm/ to test a build hosted under a path.
const base = (process.env.HTLLM_BASE || '/').replace(/\/?$/, '/');
const origin = 'http://127.0.0.1:4322';
// CI runners are several times slower than a laptop: allow longer waits and one retry
// there, so a slow page load isn't reported as a failure. Locally, failures stay strict.
const ci = !!process.env.CI;
export default defineConfig({
  testDir: './test/browser',
  timeout: ci ? 60000 : 30000,
  expect: { timeout: ci ? 15000 : 5000 },
  retries: ci ? 1 : 0,
  workers: 1,
  use: { baseURL: `${origin}${base}`, channel: 'chrome', headless: true },
  webServer: { command: 'pnpm preview --host 127.0.0.1 --port 4322', url: `${origin}${base}app`, reuseExistingServer: false },
});
