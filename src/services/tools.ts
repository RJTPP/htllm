import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/client/validators/cf-worker';
import type { ToolDefinition, SourceCitation } from '../providers/types';
import { listDocumentsByLibrary, getDocument } from '../data/documents';
import { getChunksForDocument } from '../data/chunks';
import { retrieve } from './retrieval';
import { readDocumentPage } from './document-reader';

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
const object = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });
export function documentTools(libraryId: string | null): ExecutableTool[] {
  const noLibrary = () => ({ text: 'No library selected. No documents or matching evidence are available.', citations: [] });
  return [
    { name: 'list_documents', description: 'List documents in the selected library.', parameters: object({}, []),
      execute: async () => libraryId ? ({ text: JSON.stringify((await listDocumentsByLibrary(libraryId)).map((d) => ({ id: d.id, filename: d.filename }))) }) : noLibrary() },
    { name: 'search_knowledge', description: 'Find evidence in the selected library. Try a new query when evidence is incomplete.',
      parameters: object({ query: { type: 'string', minLength: 1, maxLength: 2000 } }, ['query']),
      execute: async (args, signal) => { if (!libraryId) return noLibrary(); const result = await retrieve(libraryId, args.query as string, signal);
        return { text: result.context || 'No matching evidence.', citations: result.citations }; } },
    { name: 'read_document', description: 'Read a whole small file or one sequential page of a larger file. Start with cursor null; follow nextCursor until complete. If originalAvailable is false, only legacy search chunks are available; do not claim the whole original was read.',
      parameters: object({ documentId: { type: 'string' }, cursor: { type: ['string', 'null'] } }, ['documentId']),
      execute: async (args, signal, maxChars) => {
        signal.throwIfAborted();
        if (!libraryId) return noLibrary();
        const doc = await getDocument(args.documentId as string);
        if (!doc || doc.libraryId !== libraryId) throw new Error('Document is outside the selected library or was deleted.');
        const chunks = await getChunksForDocument(doc.id);
        signal.throwIfAborted();
        return readDocumentPage(doc, chunks, args.cursor, maxChars);
      } },
  ];
}
