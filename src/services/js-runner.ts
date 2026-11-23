import type { ScriptRequest, ScriptResult } from '../lib/js-sandbox';

/** run_js limits (agreed design): about 3 s and 64 MB per script. */
export const JS_DEADLINE_MS = 3000;
export const JS_MEMORY_BYTES = 64 * 1024 * 1024;

/**
 * Run a script in a QuickJS Web Worker. The worker is terminated if it has not
 * answered shortly after the deadline, so even a wedged engine cannot hang the
 * page. Without Worker (unit tests), QuickJS runs in place.
 */
export async function runJs(req: Omit<ScriptRequest, 'deadlineMs' | 'memoryBytes'>, signal?: AbortSignal): Promise<ScriptResult> {
  const full: ScriptRequest = { ...req, deadlineMs: JS_DEADLINE_MS, memoryBytes: JS_MEMORY_BYTES };
  if (typeof Worker === 'undefined') {
    // Unit tests only. Variable specifiers keep this path (and a second copy of the
    // engine) out of the browser bundle, which always has Worker.
    const core = 'quickjs-emscripten-core'; const wasm = '@jitl/quickjs-wasmfile-release-sync';
    const [{ newQuickJSWASMModuleFromVariant }, variant, { runScript }] = await Promise.all([
      import(/* @vite-ignore */ core), import(/* @vite-ignore */ wasm), import('../lib/js-sandbox'),
    ]);
    return runScript(await newQuickJSWASMModuleFromVariant(variant.default), full);
  }
  const worker = new Worker(new URL('../workers/js-worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { finish(); reject(new Error('Stopped.')); };
    // Generous margin: the first run also loads the engine.
    const timer = setTimeout(() => { finish(); resolve({ ok: false, output: '', error: `Stopped: the script ran longer than ${JS_DEADLINE_MS / 1000} s.` }); }, JS_DEADLINE_MS + 5000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<ScriptResult>) => { finish(); resolve(event.data); };
    worker.onerror = () => { finish(); resolve({ ok: false, output: '', error: 'The script engine could not start.' }); };
    worker.postMessage(full);
  });
}
