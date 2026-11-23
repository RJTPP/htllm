import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hash Astro's generated inline hydration scripts after static rendering. */
export default function staticCspHashes() {
  return { name: 'htllm-static-csp', hooks: {
    'astro:build:done': async ({ dir }) => {
      async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) { await visit(path); continue; }
          if (!entry.name.endsWith('.html')) continue;
          const html = await readFile(path, 'utf8');
          const hashes = new Set();
          for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
            if (!/\bsrc\s*=/.test(match[1]) && match[2]) hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
          }
          const output = html.replace(/(script-src [^;]+)(;)/, `$1 ${[...hashes].join(' ')}$2`);
          await writeFile(path, output);
        }
      }
      await visit(fileURLToPath(dir));
    },
  } };
}
