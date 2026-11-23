import { shouldInterruptAfterDeadline, type QuickJSHandle, type QuickJSWASMModule } from 'quickjs-emscripten-core';

/**
 * One run of a model-written script in QuickJS (a JavaScript engine compiled
 * to WebAssembly). The guest gets only what is handed to it here: `read(path)`
 * for the files the caller supplied, `files` (their paths), and `print` /
 * `console.log`. It has no network, timers, DOM, storage or page access.
 */
export interface ScriptRequest {
  code: string;
  /** Readable files, by workspace path. */
  files: Record<string, string>;
  deadlineMs: number;
  memoryBytes: number;
  maxOutputChars: number;
}

export interface ScriptResult {
  ok: boolean;
  /** Printed lines, capped. */
  output: string;
  /** The value of the script's last expression, as text. */
  result?: string;
  error?: string;
}

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value) ?? String(value));

export function runScript(QuickJS: QuickJSWASMModule, req: ScriptRequest): ScriptResult {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(req.memoryBytes);
  runtime.setMaxStackSize(1024 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + req.deadlineMs));
  const vm = runtime.newContext();
  const lines: string[] = [];
  let used = 0;
  let cut = false;
  const handles: QuickJSHandle[] = [];
  try {
    const print = vm.newFunction('print', (...args) => {
      const line = args.map((arg) => show(vm.dump(arg))).join(' ');
      if (used + line.length + 1 > req.maxOutputChars) { cut = true; return; }
      lines.push(line); used += line.length + 1;
    });
    handles.push(print);
    vm.setProp(vm.global, 'print', print);
    const console = vm.newObject(); handles.push(console);
    vm.setProp(console, 'log', print);
    vm.setProp(vm.global, 'console', console);
    const read = vm.newFunction('read', (pathHandle) => {
      const path = vm.getString(pathHandle);
      if (!Object.prototype.hasOwnProperty.call(req.files, path)) {
        throw new Error(`No readable file ${path}. Pass it in run_js's files list. Readable: ${Object.keys(req.files).join(', ') || 'none'}.`);
      }
      return vm.newString(req.files[path]!);
    });
    handles.push(read);
    vm.setProp(vm.global, 'read', read);
    const paths = vm.newArray(); handles.push(paths);
    Object.keys(req.files).forEach((path, i) => { const h = vm.newString(path); vm.setProp(paths, i, h); h.dispose(); });
    vm.setProp(vm.global, 'files', paths);

    const evaluated = vm.evalCode(req.code, 'script.js');
    const output = lines.join('\n') + (cut ? '\n(Output cut: print less, or summarize before printing.)' : '');
    if (evaluated.error) {
      const failure = vm.dump(evaluated.error) as { name?: string; message?: string } | string;
      evaluated.error.dispose();
      const message = typeof failure === 'string' ? failure : `${failure?.name ?? 'Error'}: ${failure?.message ?? 'unknown error'}`;
      const error = /interrupted/i.test(message) ? `Stopped: the script ran longer than ${req.deadlineMs / 1000} s.`
        : /out of memory/i.test(message) ? `Stopped: the script used more than ${Math.round(req.memoryBytes / 1024 / 1024)} MB of memory.`
        : message;
      return { ok: false, output, error };
    }
    const value = vm.dump(evaluated.value);
    evaluated.value.dispose();
    return { ok: true, output, ...(value === undefined ? {} : { result: show(value) }) };
  } finally {
    for (const handle of handles) if (handle.alive) handle.dispose();
    vm.dispose();
    runtime.dispose();
  }
}
