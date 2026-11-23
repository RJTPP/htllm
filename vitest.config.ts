import { defineConfig } from 'vitest/config';

// Tier 1 unit tests — pure logic (lib/) + the IndexedDB data layer.
// Node environment; fake-indexeddb installs a global `indexedDB` via the
// setup file so src/data/* can be exercised without a browser.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
