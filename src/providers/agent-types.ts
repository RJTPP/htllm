export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface ToolCall { id: string; name: string; arguments: string }
export interface SourceCitation {
  id: string;
  documentId: string;
  chunkId: string;
  filename: string;
  excerpt: string;
  headingPath?: string;
  pageStart?: number;
  pageEnd?: number;
}
export interface AgentEvent {
  id: string;
  tool: string;
  server?: string;
  arguments: string;
  status: 'approval' | 'running' | 'complete' | 'denied' | 'error' | 'unknown' | 'stopped';
  result?: string;
}
export interface McpConnection {
  id: string;
  name: string;
  url: string;
  tools: (ToolDefinition & { readOnlyHint?: boolean })[];
}
export interface WireMessage {
  id: string;
  threadId: string;
  createdAt: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | import('./types').ContentPart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  reasoning?: string;
}
