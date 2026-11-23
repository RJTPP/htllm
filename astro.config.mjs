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
    build: {
      // Never inline fonts as data: URLs; the CSP allows fonts from 'self' only.
      assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    },
  },
});
