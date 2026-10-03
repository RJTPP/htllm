import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4322', channel: 'chrome', headless: true },
  webServer: { command: 'pnpm preview --host 127.0.0.1 --port 4322', url: 'http://127.0.0.1:4322/app', reuseExistingServer: false },
});
