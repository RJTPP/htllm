import { defineConfig } from '@playwright/test';
// Tests navigate with relative paths ('app'), so they run under any base path.
// `pnpm test:browser:pages` sets HTLLM_BASE=/htllm/ to test the Pages build.
const base = (process.env.HTLLM_BASE || '/').replace(/\/?$/, '/');
const origin = 'http://127.0.0.1:4322';
export default defineConfig({
  testDir: './test/browser',
  timeout: 30000,
  workers: 1,
  use: { baseURL: `${origin}${base}`, channel: 'chrome', headless: true },
  webServer: { command: 'pnpm preview --host 127.0.0.1 --port 4322', url: `${origin}${base}app`, reuseExistingServer: false },
});
