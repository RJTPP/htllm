import type { AgentEvent } from '../providers/types';
import type { ExecutableTool } from './tools';
export interface ApprovalRequest { event: AgentEvent; readOnlyHint: boolean; resolve: (choice: 'allow' | 'deny' | 'trust') => void }
let pending: ApprovalRequest | null = null;
const listeners = new Set<() => void>();
const trusted = new Set<string>();
export const subscribeApprovals = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getApproval = () => pending;
const publish = () => listeners.forEach((listener) => listener());
export function clearToolTrust() { trusted.clear(); }
export async function approveTool(tool: ExecutableTool, event: AgentEvent, signal: AbortSignal): Promise<boolean> {
  if (!tool.server) return true;
  signal.throwIfAborted();
  if (tool.readOnlyHint && tool.fingerprint && trusted.has(tool.fingerprint)) return true;
  if (pending) throw new Error('Another tool approval is pending.');
  return new Promise((resolve) => {
    let finished = false;
    const finish = (choice: 'allow' | 'deny' | 'trust') => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', abort);
      if (choice === 'trust' && tool.readOnlyHint && tool.fingerprint) trusted.add(tool.fingerprint);
      pending = null; publish(); resolve(choice !== 'deny' && !signal.aborted);
    };
    const abort = () => finish('deny');
    pending = { event, readOnlyHint: !!tool.readOnlyHint, resolve: finish };
    signal.addEventListener('abort', abort, { once: true }); publish();
  });
}
