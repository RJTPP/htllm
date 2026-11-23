import { expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { documents, tasks } from './fixtures';
import { getDb } from '../src/data/db';
import { createThread } from '../src/data/threads';
import { DEFAULT_SYSTEM_PROMPT } from '../src/data/settings';
import { getHttpProviders } from '../src/providers/registry';
import { embedDocument } from '../src/lib/embed-pipeline';
import { appContext } from '../src/lib/system-context';
import { contextBand } from '../src/lib/workspace-text';
import { retrieve } from '../src/services/retrieval';
import { WORKSPACE_PROMPT, workspaceSummary, workspaceTools } from '../src/services/workspace-tools';
import { executeChat } from '../src/services/agent';
import type { AgentEvent, Message, SourceCitation, UsageStats } from '../src/providers/types';

// Opt-in only: this calls a real endpoint. Credentials come from the process
// environment and are never written into reports.
//
// Each run asks every language task in the two modes the app has, built the way
// useChat builds them:
// - chat: Automatic RAG over the library (needs an embedding model; skipped without one);
// - workspace: the library mounted under /library with the Workspace file tools and
//   context-scaled limits. Without an embedding model, search is keyword-only.
it.skipIf(process.env.HTLLM_LIVE !== '1')('records live Chat and Workspace answers for manual rubric review', async () => {
  const url = process.env.HTLLM_BASE_URL;
  const model = process.env.HTLLM_CHAT_MODEL;
  const embedding = process.env.HTLLM_EMBEDDING_MODEL || null;
  const key = process.env.HTLLM_API_KEY ?? '';
  const contextWindow = Number(process.env.HTLLM_CONTEXT_WINDOW ?? 8192);
  const runs = Number(process.env.HTLLM_RUNS ?? 1);
  const only = process.env.HTLLM_TASKS?.split(',').map((id) => id.trim()).filter(Boolean);
  if (!Number.isSafeInteger(contextWindow) || contextWindow < 4096) throw new Error('HTLLM_CONTEXT_WINDOW must be an integer of at least 4096.');
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > 5) throw new Error('HTLLM_RUNS must be an integer from 1 to 5.');
  if (!url || !model) throw new Error('Set HTLLM_BASE_URL and HTLLM_CHAT_MODEL.');
  const provider = getHttpProviders().find((candidate) => candidate.id === 'openai-compat')!;
  await provider.configure(url, key);
  const db = await getDb();
  await db.put('libraries', { id: 'live-eval', name: 'Project notes', ...(embedding ? { embeddingProviderId: provider.id, embeddingModelId: embedding } : {}), createdAt: 1 });
  for (const doc of documents) {
    await db.put('documents', { id: doc.id, libraryId: 'live-eval', filename: `${doc.id}.md`, mimeType: 'text/markdown', sizeBytes: doc.text.length, chunkCount: 1, createdAt: 1, extractedText: doc.text });
    await db.put('chunks', { id: `${doc.id}-1`, documentId: doc.id, index: 0, text: doc.text, startOffset: 0 });
    if (embedding) await embedDocument(doc.id, provider, embedding);
  }
  const band = contextBand(contextWindow);
  const modes = embedding ? ['chat', 'workspace'] as const : ['workspace'] as const;
  const selected = tasks.filter((task) => task.kind !== 'safety' && (!only?.length || only.includes(task.id)));
  const expectedCount = runs * selected.length * modes.length;
  const results: Record<string, unknown>[] = [];
  const report = async () => {
    await mkdir('eval/results', { recursive: true });
    const body = JSON.stringify({ schemaVersion: 2, generatedAt: new Date().toISOString(), mode: 'live-node-endpoint', browserQualified: false,
      model, embedding, contextWindow, band, runs, modes, expectedCount, runtimeVersion: process.env.HTLLM_RUNTIME_VERSION ?? 'not supplied',
      rubricStatus: 'manual-review-required', results }, null, 2);
    await writeFile('eval/results/live.json', (key ? body.replaceAll(key, '[credential redacted]') : body) + '\n');
  };
  const system = (workspace: boolean, ragBlock = ''): Message => ({ id: '__system', threadId: 'eval', role: 'system', createdAt: 0,
    content: [ragBlock, DEFAULT_SYSTEM_PROMPT, appContext({ now: new Date(), workspace })].filter(Boolean).join('\n\n') });
  for (let run = 1; run <= runs; run++) for (const task of selected) for (const mode of modes) {
    const start = performance.now(); const signal = AbortSignal.timeout(180_000);
    let answer = ''; let reasoning = ''; let sources: SourceCitation[] = []; let activity: AgentEvent[] = []; let usage: UsageStats | undefined; let budgetReached = false;
    const question: Message = { id: 'question', threadId: 'eval', role: 'user', createdAt: 1, content: task.question };
    try {
      let messages: Message[]; let agent: Parameters<typeof executeChat>[2];
      if (mode === 'chat') {
        const result = await retrieve('live-eval', task.question, signal, Math.max(500, Math.min(4000, Math.floor(contextWindow / 4) * 4)));
        sources = result.citations;
        messages = [system(false, result.context || 'No matching evidence was found in the selected library. Tell the user this; do not invent a document-grounded answer.'), question];
      } else {
        // A fresh chat per answer: notes from one task must not leak into the next.
        const thread = await createThread({ title: task.id, providerId: provider.id, modelId: model, mode: 'workspace', libraryId: 'live-eval', createdAt: Date.now(), updatedAt: Date.now() });
        const ctx = { threadId: thread.id, libraryIds: ['live-eval'], band, messageId: `answer-${task.id}-${run}`, readVersions: new Map<string, number>() };
        messages = [{ id: '__agent', threadId: thread.id, role: 'system', createdAt: 0, content: `${WORKSPACE_PROMPT}\n\n${await workspaceSummary(ctx)}` }, system(true), question];
        agent = { tools: workspaceTools(ctx, { csv: false, js: band.chars > 3000 }), contextWindow, maxCalls: band.calls, maxResultChars: band.chars,
          approve: async () => false, onActivity: (events) => { activity = events.map((event) => ({ ...event })); },
          onSources: (incoming) => { sources = [...new Map([...sources, ...incoming].map((source) => [source.id, source])).values()]; },
          onBudgetReached: () => { budgetReached = true; }, onPresent: () => {} };
      }
      for await (const chunk of executeChat(provider, { modelId: model, signal, temperature: 0, maxTokens: 2048, messages }, agent)) {
        answer += chunk.delta; if (chunk.reasoning) reasoning += chunk.reasoning; if (chunk.usage) usage = chunk.usage;
      }
      results.push({ id: task.id, kind: task.kind, run, mode, question: task.question, expectedAnswer: task.answer, expectedDocuments: task.evidence,
        answer, reasoning: reasoning || null, sources, activity, usage: usage ?? null, latencyMs: performance.now() - start, budgetReached,
        toolCount: activity.filter((event) => ['complete', 'error', 'unknown'].includes(event.status)).length, rubric: 'unscored' });
    } catch (error) {
      results.push({ id: task.id, kind: task.kind, run, mode, error: error instanceof Error ? error.message : 'Run failed', latencyMs: performance.now() - start, rubric: 'failed' });
    }
    await report();
  }
  expect(results).toHaveLength(expectedCount);
}, 3 * 60 * 60 * 1000);
