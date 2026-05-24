import { useState, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { EmbeddingProvider } from '../../providers/types';
import { hybridSearch, type SearchResult } from '../../lib/hybrid-search';

/**
 * Semantic search panel for the Knowledge page. Embeds the query through
 * the active provider, then runs hybrid (BM25 + cosine) retrieval. Results
 * show ranked chunk snippets with source attribution (filename + heading).
 */
export function SemanticSearch({
  provider,
  modelId,
  ready,
}: {
  provider: EmbeddingProvider | null;
  modelId: string | null;
  /** True when at least one embedding exists under the active model. */
  ready: boolean;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || !provider || !modelId) return;
    setSearching(true);
    setError(null);
    try {
      const { vectors } = await provider.embed({ modelId, inputs: [trimmed] });
      const vec = vectors[0];
      if (!vec) {
        setResults([]);
        return;
      }
      const hits = await hybridSearch(trimmed, vec, modelId, {
        topK: 8,
        minScore: 0.3,
      });
      setResults(hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, [query, provider, modelId]);

  const disabled = !provider || !modelId || !ready || searching;

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex items-center gap-2"
      >
        <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-line bg-bg focus-within:border-accent/60">
          <Search size={14} className="text-mute" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              ready
                ? 'Ask your documents…'
                : 'Embed at least one document to enable search'
            }
            disabled={!ready}
            className="flex-1 bg-transparent font-sans text-[13px] text-text placeholder:text-mute focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || query.trim().length === 0}
          className="flex items-center gap-1.5 font-mono text-[11px] px-3 py-2 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {searching ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Search size={12} />
          )}
          search
        </button>
      </form>

      {error && (
        <div className="font-mono text-[10px] text-err border border-err/40 bg-err/5 px-3 py-2">
          {error}
        </div>
      )}

      {searched && !searching && results.length === 0 && !error && (
        <div className="font-mono text-[11px] text-mute text-center py-4">
          No matches above the relevance threshold.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.chunkId}
              className="border border-line bg-surface/40 p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-[10px] text-mute truncate">
                  {r.filename}
                  {r.headingPath && (
                    <span className="text-accent/70"> · {r.headingPath}</span>
                  )}
                </div>
                <div className="font-mono text-[9px] text-mute shrink-0">
                  score {r.score.toFixed(3)} · vec {r.vectorScore.toFixed(2)} · bm25 {r.bm25Score.toFixed(2)}
                </div>
              </div>
              <div className="font-sans text-[12.5px] text-text/90 leading-relaxed whitespace-pre-wrap line-clamp-6">
                {r.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
