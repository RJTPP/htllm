import { useState, useCallback, useMemo, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { EmbeddingProvider } from '../../providers/types';
import { hybridSearch, type SearchResult } from '../../lib/hybrid-search';
import type { LibraryWithStats } from '../../hooks/useKnowledge';

/**
 * Semantic search panel for the Knowledge page. Embeds the query through
 * the active provider, then runs hybrid (BM25 + cosine) retrieval. Scope
 * chips let the user narrow to a single library or stay across "all
 * compatible" libraries (those using the same embedding model as the
 * active library — vectors from a different model can't be cross-searched).
 */
export function SemanticSearch({
  provider,
  modelId,
  libraries,
  activeLibraryId,
  ready,
}: {
  provider: EmbeddingProvider | null;
  modelId: string | null;
  libraries: LibraryWithStats[];
  activeLibraryId: string;
  /** True when at least one embedding exists under the active model. */
  ready: boolean;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Compatible libraries — share the active library's pinned model.
  // "All compatible" is the cross-library default scope; per-library
  // chips narrow further. Libraries using a different model are silently
  // excluded since their vectors aren't comparable.
  const compatible = useMemo(
    () =>
      modelId
        ? libraries.filter((l) => l.lib.embeddingModelId === modelId)
        : libraries.filter((l) => !l.lib.embeddingModelId),
    [libraries, modelId],
  );

  // Scope is either 'all' (every compatible library) or a single id.
  // Default to the active library so the search inherits the user's
  // current context — they're reading library A's docs, asking a
  // question should hit library A unless they widen explicitly.
  const [scope, setScope] = useState<'all' | string>(() => {
    const activeIsCompatible = compatible.some((c) => c.lib.id === activeLibraryId);
    return activeIsCompatible ? activeLibraryId : 'all';
  });

  // If the active library or compat set shifts (model change, library
  // delete, etc.) and our narrow scope no longer exists, fall back to
  // the new active library or "all".
  useEffect(() => {
    if (scope === 'all') return;
    const stillExists = compatible.some((c) => c.lib.id === scope);
    if (!stillExists) {
      const activeIsCompatible = compatible.some((c) => c.lib.id === activeLibraryId);
      setScope(activeIsCompatible ? activeLibraryId : 'all');
    }
  }, [scope, compatible, activeLibraryId]);

  // Scope chips to render. "All" always present (when there are any
  // compatible libraries); then one chip per library.
  const scopeChips = useMemo(() => {
    if (compatible.length === 0) return [];
    return [
      {
        id: 'all' as const,
        label:
          compatible.length === 1
            ? 'All compatible · 1 library'
            : `All compatible · ${compatible.length} libraries`,
        docCount: compatible.reduce((sum, c) => sum + c.docCount, 0),
      },
      ...compatible.map(({ lib, docCount }) => ({
        id: lib.id,
        label: lib.name,
        docCount,
      })),
    ];
  }, [compatible]);

  const libraryIds = useMemo<string[]>(() => {
    if (scope === 'all') return compatible.map((c) => c.lib.id);
    return [scope];
  }, [scope, compatible]);

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
        libraryIds,
      });
      setResults(hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, [query, provider, modelId, libraryIds]);

  const disabled = !provider || !modelId || !ready || searching;

  // Show a hint when the active library uses a model that no other
  // library shares — the cross-library scope still works (just one item)
  // but it's worth telling the user there's no expansion available.
  const incompatibleCount =
    modelId !== null
      ? libraries.filter((l) => l.lib.embeddingModelId && l.lib.embeddingModelId !== modelId).length
      : 0;

  return (
    <div className="flex flex-col h-full min-h-0 space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex items-center gap-2 shrink-0"
      >
        <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-line bg-bg focus-within:border-accent/60">
          <Search size={14} className="text-mute" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              ready
                ? 'Ask across your documents…'
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
          {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          search
        </button>
      </form>

      {/* Scope chips — only meaningful when there's more than one library
          to choose from. The single-library case hides the row entirely. */}
      {scopeChips.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <span className="font-mono text-[10px] text-mute uppercase tracking-widest">
            scope
          </span>
          {scopeChips.map((chip) => {
            const active = scope === chip.id;
            const isAll = chip.id === 'all';
            return (
              <button
                key={chip.id}
                onClick={() => setScope(chip.id)}
                className={`flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 border transition-colors ${
                  active
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-line text-mute hover:text-text'
                }`}
              >
                <span>{chip.label}</span>
                {!isAll && (
                  <span className="text-mute/70">· {chip.docCount} docs</span>
                )}
              </button>
            );
          })}
          {incompatibleCount > 0 && (
            <span className="font-mono text-[10px] text-mute/70">
              · {incompatibleCount} library{incompatibleCount === 1 ? '' : 'ies'} use a
              different model — switch models to include
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="font-mono text-[10px] text-err border border-err/40 bg-err/5 px-3 py-2 shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {searched && !searching && results.length === 0 && !error && (
          <div className="font-mono text-[11px] text-mute text-center py-8">
            No matches above the relevance threshold.
          </div>
        )}

        {!searched && (
          <div className="font-mono text-[11px] text-mute text-center py-10">
            Type a question — retrieval pulls the most relevant chunks across the selected scope.
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
                    score {r.score.toFixed(3)} · vec {r.vectorScore.toFixed(2)} · bm25{' '}
                    {r.bm25Score.toFixed(2)}
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
    </div>
  );
}
