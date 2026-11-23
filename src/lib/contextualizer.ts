/**
 * Contextual Retrieval (Anthropic, 2024) — D8 Part B.
 *
 * For each chunk, ask a chat model to write a short "situating" blurb
 * (50-100 tokens) that names the parent doc + section + topic. Prepend
 * the blurb to the chunk text BEFORE embedding. The embedded vector now
 * encodes the situating context too, so queries that reference the
 * parent ("how did Acme do in Q3?") hit chunks that never name "Acme"
 * directly. Anthropic's evals: 35-49% retrieval failure reduction.
 *
 * The chunk text stored in IndexedDB stays clean — only the *vector*
 * reflects the blurb. At retrieval time, callers see the original chunk
 * (or its parent under D8 Part A) just as before.
 *
 * Cost model: one chat-model call per chunk during embedding. On a small
 * local WebLLM model at ~30 tok/s, ~3 sec/chunk → ~5 min per 100-chunk
 * doc. The library-creation UI must surface this upfront.
 */

import type { ChatProvider } from '../providers/types';
import { stripThinking } from './thinking';

/** Hard cap per contextualization call. Burns through reasoning silently
 *  if the model takes too long — better to ship without the blurb than
 *  to hang the entire embed pass. */
const CONTEXTUALIZE_TIMEOUT_MS = 30_000;

/** Anthropic's prompt, adapted to use the parent chunk as the
 *  document context instead of the full document (a 1500-token parent
 *  is enough situating context and ~10x cheaper than the full doc). */
function buildPrompt(parentText: string, chunkText: string): string {
  return (
    '<document>\n' +
    parentText +
    '\n</document>\n' +
    'Here is the chunk we want to situate within the document above:\n' +
    '<chunk>\n' +
    chunkText +
    '\n</chunk>\n' +
    'Please give a short succinct context (one or two sentences, 50-100 ' +
    'tokens max) to situate this chunk within the overall document for the ' +
    'purposes of improving search retrieval of the chunk. Answer ONLY with ' +
    'the succinct context and nothing else.'
  );
}

/**
 * A function that produces a situating blurb for a (chunk, parent) pair.
 * Returns the blurb text (no quotes, no surrounding markup), or `null`
 * to signal a non-fatal skip — the embed pipeline will fall back to
 * vanilla embedding for that chunk without breaking the run.
 */
export type Contextualizer = (
  chunkText: string,
  parentText: string,
  signal?: AbortSignal,
) => Promise<string | null>;

/**
 * Build a Contextualizer that closes over a ChatProvider + modelId.
 * Caller is responsible for choosing the provider/model — typically the
 * one currently active in the app, since the user has already loaded /
 * configured it.
 */
export function createContextualizer(
  provider: ChatProvider,
  modelId: string,
): Contextualizer {
  return async (chunkText, parentText, externalSignal) => {
    if (!modelId) return null;

    // Hook up an internal abort that fires on either the external signal
    // or our per-call timeout. The chat call itself accepts a single
    // signal, so we forward the combined one.
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);
    const timer = setTimeout(() => controller.abort(), CONTEXTUALIZE_TIMEOUT_MS);

    try {
      const prompt = buildPrompt(parentText, chunkText);
      let out = '';
      for await (const chunk of provider.chat({
        messages: [
          {
            id: '__contextualize',
            threadId: '',
            role: 'user',
            content: prompt,
            createdAt: 0,
          },
        ],
        modelId,
        temperature: 0.2,
        // Generous output budget — reasoning models burn tokens internally
        // before emitting visible text. A tight cap would truncate them
        // mid-think and leave the blurb empty.
        maxTokens: 1024,
        reasoningEffort: 'off',
        signal: controller.signal,
      })) {
        out += chunk.delta;
      }
      const cleaned = cleanBlurb(out);
      if (!cleaned) {
        console.warn('[contextualizer] empty/unusable blurb from model');
        return null;
      }
      return cleaned;
    } catch (err) {
      if (controller.signal.aborted) {
        console.warn(`[contextualizer] aborted/timed out after ${CONTEXTUALIZE_TIMEOUT_MS}ms`);
      } else {
        console.warn('[contextualizer] generation failed:', err);
      }
      return null;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  };
}

/** Combine the blurb and chunk text into the string that actually gets
 *  embedded. Kept centralized so retrieval-side tooling can mirror the
 *  same formatting if we ever need to reproduce embeddings. */
export function formatContextualizedChunk(blurb: string, chunkText: string): string {
  return `${blurb.trim()}\n\n${chunkText}`;
}

/** Normalize the model's raw output into a usable blurb, or null. */
function cleanBlurb(raw: string): string | null {
  let s = stripThinking(raw).trim();
  // Strip leading XML/markdown wrappers the model sometimes adds back.
  s = s.replace(/^<context>\s*/i, '').replace(/\s*<\/context>\s*$/i, '');
  s = s.replace(/^["'`*]+|["'`*]+$/g, '').trim();
  if (!s) return null;
  // Hard cap so a runaway blurb can't bloat the embedded text. Anthropic
  // recommends 50-100 tokens (~400 chars); 600 leaves headroom without
  // letting a model dump several paragraphs.
  if (s.length > 600) s = `${s.slice(0, 600).trim()}…`;
  return s;
}
