import { afterEach, expect, it } from 'vitest';
import { approveTool, clearToolTrust, getApproval } from './approvals';
import type { ExecutableTool } from './tools';
const tool: ExecutableTool = { name: 'read', server: 'fixture', description: 'Read', parameters: {}, fingerprint: 'v1', readOnlyHint: true, execute: async () => ({ text: '' }) };
const event = { id: 'c', tool: 'read', arguments: '{}', status: 'approval' as const };
afterEach(() => { getApproval()?.resolve('deny'); clearToolTrust(); });
it('requires explicit trust and invalidates it when cleared or definition changes', async () => {
  const signal = new AbortController().signal;
  const first = approveTool(tool, event, signal); expect(getApproval()).not.toBeNull(); getApproval()!.resolve('trust'); expect(await first).toBe(true);
  expect(await approveTool(tool, event, signal)).toBe(true); expect(getApproval()).toBeNull();
  const changed = approveTool({ ...tool, fingerprint: 'v2' }, event, signal); expect(getApproval()).not.toBeNull(); getApproval()!.resolve('deny'); expect(await changed).toBe(false);
  clearToolTrust(); const cleared = approveTool(tool, event, signal); expect(getApproval()).not.toBeNull(); getApproval()!.resolve('deny'); await cleared;
});
it('does not persist trust for writes or unknown actions', async () => {
  const write = { ...tool, readOnlyHint: false }; const signal = new AbortController().signal;
  const first = approveTool(write, event, signal); getApproval()!.resolve('trust'); await first;
  const second = approveTool(write, event, signal); expect(getApproval()).not.toBeNull(); getApproval()!.resolve('deny'); expect(await second).toBe(false);
});
it('cancellation removes pending approval and a stale button cannot grant trust', async () => {
  const controller = new AbortController(); const result = approveTool(tool, event, controller.signal); const stale = getApproval()!;
  controller.abort(); stale.resolve('trust'); expect(await result).toBe(false); expect(getApproval()).toBeNull();
  const next = approveTool(tool, event, new AbortController().signal); expect(getApproval()).not.toBeNull(); getApproval()!.resolve('deny'); await next;
});
