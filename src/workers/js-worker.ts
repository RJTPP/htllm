/// <reference lib="webworker" />
/**
 * Runs run_js scripts in QuickJS, off the main thread. The caller terminates
 * this worker if a run overruns, as a backstop to QuickJS's own deadline.
 */
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { runScript, type ScriptRequest } from '../lib/js-sandbox';

const QuickJS = newQuickJSWASMModuleFromVariant(variant);
self.onmessage = async (event: MessageEvent<ScriptRequest>) => {
  try {
    self.postMessage(runScript(await QuickJS, event.data));
  } catch (error) {
    self.postMessage({ ok: false, output: '', error: error instanceof Error ? error.message : 'The script could not run.' });
  }
};
