import { it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { documents, tasks } from './fixtures';
import { getDb } from '../src/data/db';
import { buildRagContext } from '../src/lib/rag-context';
import { invalidateHybridSearchCache } from '../src/lib/hybrid-search';
import { executeChat } from '../src/services/agent';
import type { ChatParams, ChatProvider, EmbeddingProvider } from '../src/providers/types';

// A deterministic lexical vector is a harness fixture, NOT an embedding-model
// qualification result. Real model answer/citation rubric scores remain pending.
const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const vocabulary = [...new Set(documents.flatMap((doc) => words(doc.text)))];
const vector = (text: string) => { const tokens = words(text); return Float32Array.from(vocabulary.map((word) => tokens.filter((token) => token === word).length)); };
const embed = { embed: async ({ inputs }: {inputs: string[]}) => ({ modelId: 'fixture-lexical', dim: vocabulary.length, vectors: inputs.map(vector) }) } as EmbeddingProvider;

it('records the fixed 30-task deterministic baseline without claiming live quality', async () => {
  const db = await getDb();
  for (const name of db.objectStoreNames) await db.clear(name);
  await db.put('libraries', { id: 'eval', name: 'Evaluation', embeddingModelId: 'fixture-lexical', createdAt: 1 });
  for (const doc of documents) {
    await db.put('documents', { id: doc.id, libraryId: 'eval', filename: `${doc.id}.md`, mimeType: 'text/markdown', sizeBytes: doc.text.length, chunkCount: 1, createdAt: 1 });
    await db.put('chunks', { id: `${doc.id}-1`, documentId: doc.id, index: 0, text: doc.text, startOffset: 0 });
    await db.put('embeddings', { chunkId: `${doc.id}-1`, embeddingModelId: 'fixture-lexical', dim: vocabulary.length, vector: Array.from(vector(doc.text)) });
  }
  invalidateHybridSearchCache();
  const results: Record<string, unknown>[] = [];
  for (const task of tasks) {
    const start = performance.now();
    if (task.kind !== 'safety') {
      const result = await buildRagContext(task.question, embed, 'fixture-lexical', { libraryIds: ['eval'] });
      expect(result.context.length).toBeLessThanOrEqual(4000);
      const found = [...new Set(result.sources.map((source) => source.documentId))];
      results.push({ ...task, retrievedDocumentIds: found, evidenceCoverage: task.evidence.length ? task.evidence.filter((id) => found.includes(id)).length / task.evidence.length : null, noMatchingEvidence: found.length === 0, answerRubric: 'pending-live-model', latencyMs: performance.now() - start, toolCount: 0, tokenUsage: null });
      continue;
    }
    let executions = 0; let requests = 0; let lastRequest: ChatParams | undefined;
    const controller = new AbortController();
    if (task.scenario === 'cancel') controller.abort();
    const provider = { id: 'fixture', chat: async function* (params: ChatParams) {
      requests++; lastRequest = params;
      if (requests === 1) yield { delta: '', toolCalls: [{ index: 0, id: 'a', name: 'action', arguments: task.scenario === 'malformed' ? '{broken' : '{}' }], finishReason: 'tool_calls' as const };
      else yield { delta: 'finished', finishReason: 'stop' as const };
    } } as ChatProvider;
    let aborted = false;
    try {
      for await (const _ of executeChat(provider, { modelId: 'fixture', messages: [{ id: 'u', threadId: 't', role: 'user', content: task.question, createdAt: 1 }], maxTokens: 256, signal: controller.signal }, {
        tools: [{ name: 'action', description: 'Synthetic external action', server: 'fixture', parameters: { type: 'object', additionalProperties: false }, execute: async () => { executions++; if (task.scenario === 'unknown') throw new Error('ambiguous outcome'); return { text: 'done' }; } }],
        contextWindow: 8192, maxCalls: task.scenario === 'limit' ? 1 : 8, approve: async () => task.scenario !== 'denial', onActivity: () => {}, onSources: () => {},
      })) { /* drain */ }
    } catch (error) { if (task.scenario !== 'cancel') throw error; aborted = true; }
    const passed = ['denial', 'malformed', 'cancel'].includes(task.scenario!) ? executions === 0 && (task.scenario !== 'cancel' || aborted) : executions === 1 && lastRequest?.tools === undefined;
    expect(passed, task.id).toBe(true);
    results.push({ ...task, passed, latencyMs: performance.now() - start, toolCount: executions, tokenUsage: null });
  }
  expect(results).toHaveLength(30);
  const answerable = results.filter((r) => r.kind === 'document');
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'deterministic-harness', model: null, embedding: 'synthetic lexical fixture', liveQualification: false, answerableEvidenceRecall: answerable.filter((r) => r.evidenceCoverage === 1).length / answerable.length, results };
  await mkdir('eval/results', { recursive: true });
  await writeFile('eval/results/baseline.json', JSON.stringify(report, null, 2) + '\n');
});
