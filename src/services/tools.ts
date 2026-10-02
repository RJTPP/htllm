import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/client/validators/cf-worker';
import type { ToolDefinition, SourceCitation } from '../providers/types';
import { listDocumentsByLibrary, getDocument } from '../data/documents';
import { getChunksForDocument } from '../data/chunks';
import { retrieve } from './retrieval';

export interface ExecutableTool extends ToolDefinition {
  displayName?: string;
  server?: string;
  readOnlyHint?: boolean;
  fingerprint?: string;
  execute: (args: Record<string, unknown>, signal: AbortSignal) => Promise<{ text: string; citations?: SourceCitation[] }>;
}
export const schemaValidator = new CfWorkerJsonSchemaValidator();
export function parseArguments(tool: ToolDefinition, raw: string): Record<string, unknown> {
  const args: unknown = JSON.parse(raw);
  const result = schemaValidator.getValidator(tool.parameters)(args);
  if (!result.valid || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid tool arguments');
  return args as Record<string, unknown>;
}
const object = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });
export function documentTools(libraryId: string): ExecutableTool[] {
  return [
    { name: 'list_documents', description: 'List documents in the selected library.', parameters: object({}, []),
      execute: async () => ({ text: JSON.stringify((await listDocumentsByLibrary(libraryId)).map((d) => ({ id: d.id, filename: d.filename }))) }) },
    { name: 'search_knowledge', description: 'Find evidence in the selected library. Try a new query when evidence is incomplete.',
      parameters: object({ query: { type: 'string', minLength: 1, maxLength: 2000 } }, ['query']),
      execute: async (args, signal) => { const result = await retrieve(libraryId, args.query as string, signal);
        return { text: result.context || 'No matching evidence.', citations: result.citations }; } },
    { name: 'read_document', description: 'Read a document chunk by index. Use the returned nextIndex to continue reading.',
      parameters: object({ documentId: { type: 'string' }, index: { type: 'integer', minimum: 0 } }, ['documentId', 'index']),
      execute: async (args, signal) => {
        signal.throwIfAborted();
        const doc = await getDocument(args.documentId as string);
        if (!doc || doc.libraryId !== libraryId) throw new Error('Document is outside the selected library or was deleted.');
        const chunks = await getChunksForDocument(doc.id);
        const chunk = chunks.find((c) => c.index === args.index);
        if (!chunk) throw new Error('Chunk index is out of range.');
        const excerpt = chunk.text.slice(0, 4000);
        return { text: JSON.stringify({ filename: doc.filename, page: chunk.pageStart, text: excerpt, nextIndex: chunks.some((c) => c.index === chunk.index + 1) ? chunk.index + 1 : null }),
          citations: [{ id: chunk.id, chunkId: chunk.id, documentId: doc.id, filename: doc.filename, excerpt, headingPath: chunk.headingPath, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd }] };
      } },
  ];
}
