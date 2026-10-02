import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import staticCspHashes from './scripts/csp.mjs';

export default defineConfig({
  output: 'static',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
    staticCspHashes(),
  ],
  vite: {
    worker: {
      format: 'es',
    },
  },
});
