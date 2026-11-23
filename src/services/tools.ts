import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/client/validators/cf-worker';
import type { ToolDefinition, SourceCitation } from '../providers/types';

export interface ExecutableTool extends ToolDefinition {
  displayName?: string;
  server?: string;
  readOnlyHint?: boolean;
  fingerprint?: string;
  execute: (args: Record<string, unknown>, signal: AbortSignal, maxChars?: number) => Promise<{ text: string; citations?: SourceCitation[]; presented?: import('../providers/types').PresentedFile }>;
}
export const schemaValidator = new CfWorkerJsonSchemaValidator();
/** Parse and validate tool arguments. Errors are written for the model, so it
 *  can correct the call: they name the tool, say what was wrong, and ask for a rewrite. */
export function parseArguments(tool: ToolDefinition, raw: string): Record<string, unknown> {
  const rewrite = `Rewrite the ${tool.name} call with a JSON object that matches its parameters.`;
  let args: unknown;
  // Some servers send an empty string for tools without parameters.
  try { args = JSON.parse(raw.trim() === '' ? '{}' : raw); } catch { throw new Error(`Invalid tool arguments: ${tool.name} received malformed JSON. ${rewrite}`); }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error(`Invalid tool arguments: ${tool.name} needs a JSON object. ${rewrite}`);
  const result = schemaValidator.getValidator(tool.parameters)(args);
  if (!result.valid) throw new Error(`Invalid tool arguments for ${tool.name}: ${result.errorMessage ?? 'they do not match the schema'}. ${rewrite}`);
  return args as Record<string, unknown>;
}

/** Find a tool by name, tolerating case differences some models introduce. */
export function findTool<T extends ToolDefinition>(tools: T[], name: string): T | undefined {
  return tools.find((t) => t.name === name) ?? tools.find((t) => t.name.toLowerCase() === name.toLowerCase());
}
