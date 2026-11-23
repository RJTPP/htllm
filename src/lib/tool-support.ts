/**
 * Decide whether a model may use tools (D-23). The provider must support tool
 * calling at all; then a user override wins; then what the server reported;
 * otherwise assume it can, because many endpoints report nothing.
 */
export type ToolSupportSource = 'provider' | 'override' | 'detected' | 'assumed';

export interface ToolSupport {
  supported: boolean;
  source: ToolSupportSource;
}

export function resolveToolSupport(providerCapable: boolean, detected?: boolean, override?: boolean): ToolSupport {
  if (!providerCapable) return { supported: false, source: 'provider' };
  if (override !== undefined) return { supported: override, source: 'override' };
  if (detected !== undefined) return { supported: detected, source: 'detected' };
  return { supported: true, source: 'assumed' };
}

/**
 * The override a click should store to flip the current decision. Returns
 * undefined (clear the override) when flipping lands back on what the server
 * reported, or on the assumed default, so overrides never pile up needlessly.
 */
export function nextOverride(current: ToolSupport, detected?: boolean): boolean | undefined {
  const flipped = !current.supported;
  return flipped === (detected ?? true) ? undefined : flipped;
}
