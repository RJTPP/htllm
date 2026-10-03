import { getDb } from './db';
import { setKey, deleteKey } from './keys';
import type { McpConnection } from '../providers/types';
export async function listMcpConnections(): Promise<McpConnection[]> { return (await getDb()).getAll('mcpConnections'); }
export async function saveMcpConnection(connection: McpConnection, token: string) {
  await (await getDb()).put('mcpConnections', connection);
  if (token) await setKey(`mcp:${connection.id}`, token); else await deleteKey(`mcp:${connection.id}`);
}
export async function deleteMcpConnection(id: string) {
  await (await getDb()).delete('mcpConnections', id); await deleteKey(`mcp:${id}`);
}
