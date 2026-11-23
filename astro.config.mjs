import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import staticCspHashes from './scripts/csp.mjs';

export default defineConfig({
  // The hosted copy, on its own origin (a dedicated subdomain, not a path on rjtpp.com).
  site: 'https://htllm.rjtpp.com',
  // `/` for the hosted site and the offline zip. `pnpm build:subpath` sets `/htllm/` to
  // check that the app also works when hosted under a path.
  base: process.env.HTLLM_BASE || '/',
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
