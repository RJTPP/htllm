import { beforeAll, describe, expect, it } from 'vitest';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { runScript } from './js-sandbox';

let QuickJS: QuickJSWASMModule;
beforeAll(async () => { QuickJS = await newQuickJSWASMModuleFromVariant(variant); });
const run = (code: string, extra: Partial<Parameters<typeof runScript>[1]> = {}) =>
  runScript(QuickJS, { code, files: {}, deadlineMs: 1000, memoryBytes: 16 * 1024 * 1024, maxOutputChars: 2000, ...extra });

describe('runScript (QuickJS)', () => {
  it('prints, returns the last value, and reads supplied files', () => {
    const out = run(`const rows = read('/uploads/a.csv').trim().split('\\n').slice(1).map(l => l.split(',')); print('rows', rows.length); console.log({ files }); rows.reduce((s, r) => s + Number(r[1]), 0)`,
      { files: { '/uploads/a.csv': 'item,n\nx,2\ny,40\n' } });
    expect(out).toEqual({ ok: true, output: 'rows 2\n{"files":["/uploads/a.csv"]}', result: '42' });
  });
  it('has no network, timers, DOM, storage or page access', () => {
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'setInterval', 'document', 'window', 'localStorage', 'indexedDB', 'importScripts', 'postMessage', 'self']) {
      expect(run(`typeof ${name}`).result).toBe('undefined');
    }
    expect(run(`read('/notes/secret.md')`)).toMatchObject({ ok: false, error: expect.stringContaining('No readable file /notes/secret.md') });
  });
  it('stops runaway loops at the deadline and runaway memory at the limit', () => {
    const started = Date.now();
    expect(run('while (true) {}', { deadlineMs: 300 })).toMatchObject({ ok: false, error: 'Stopped: the script ran longer than 0.3 s.' });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(run('const a = []; while (true) a.push(new Array(10000).fill(1));', { memoryBytes: 8 * 1024 * 1024 })).toMatchObject({ ok: false, error: expect.stringMatching(/memory|Stopped/) });
  });
  it('reports script errors and caps output', () => {
    expect(run('null.x')).toMatchObject({ ok: false, error: expect.stringMatching(/^TypeError/) });
    const big = run(`for (let i = 0; i < 1000; i++) print('line ' + i)`, { maxOutputChars: 100 });
    expect(big.output.length).toBeLessThan(200);
    expect(big.output).toContain('Output cut');
  });
});
