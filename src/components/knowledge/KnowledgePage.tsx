import { useMemo } from 'react';
import { Database, Sparkles, AlertTriangle } from 'lucide-react';
import { useEmbeddingModel } from '../../hooks/useEmbeddingModel';
import { useKnowledge, useEmbeddingCount } from '../../hooks/useKnowledge';
import { EmbeddingModelSelector } from './EmbeddingModelSelector';
import { DocumentUpload } from './DocumentUpload';
import { DocumentList } from './DocumentList';
import { EmbeddingProgress } from './EmbeddingProgress';
import { SemanticSearch } from './SemanticSearch';

/**
 * Top-level Knowledge page — replaces the Phase 3 stub. Coordinates the
 * embedding model selector, document upload + listing, embedding pipeline,
 * and semantic search into a single workspace.
 */
export function KnowledgePage() {
  const { providerId, modelId, provider, setEmbeddingModel } = useEmbeddingModel();
  const knowledge = useKnowledge({ provider, modelId });
  const embeddingCount = useEmbeddingCount(modelId);

  const modelSelected = Boolean(provider && modelId);
  const hasEmbeddings = embeddingCount > 0;

  // Number of docs that need embedding under the current model.
  const pendingDocCount = useMemo(
    () => knowledge.docs.filter((d) => d.status !== 'full').length,
    [knowledge.docs],
  );

  return (
    <div className="flex-1 grid-bg overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Database size={20} className="text-accent" />
            <div>
              <h1 className="font-mono text-lg font-medium tracking-tight">Knowledge</h1>
              <p className="text-[12px] text-mute mt-0.5">
                Ingest documents, embed them, and retrieve relevant chunks in chat.
              </p>
            </div>
          </div>
          <EmbeddingModelSelector
            providerId={providerId}
            modelId={modelId}
            onSelect={setEmbeddingModel}
          />
        </div>

        {/* No-model warning */}
        {!modelSelected && (
          <div className="border border-yellow-500/40 bg-yellow-500/5 px-3 py-2 flex items-start gap-2">
            <AlertTriangle size={12} className="text-yellow-500 mt-0.5 shrink-0" />
            <div className="font-mono text-[10px] text-text/80 leading-relaxed">
              Select an embedding model above to start embedding documents and
              searching the knowledge base.
            </div>
          </div>
        )}

        {/* Semantic search */}
        <SemanticSearch provider={provider} modelId={modelId} ready={hasEmbeddings} />

        {/* Upload */}
        <DocumentUpload onUpload={knowledge.uploadFiles} />

        {/* Progress */}
        <EmbeddingProgress progress={knowledge.progress} />

        {/* Error banner */}
        {knowledge.error && (
          <div className="font-mono text-[10px] text-err border border-err/40 bg-err/5 px-3 py-2">
            {knowledge.error}
          </div>
        )}

        {/* Document list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[11px] text-text/80">
              Documents
              <span className="ml-2 text-mute">
                {knowledge.docs.length} · {pendingDocCount} pending
              </span>
            </div>
            {modelSelected && pendingDocCount > 0 && (
              <button
                onClick={knowledge.embedAll}
                disabled={knowledge.progress !== null}
                className="flex items-center gap-1.5 font-mono text-[10px] px-2.5 py-1 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30"
              >
                <Sparkles size={11} /> embed all
              </button>
            )}
          </div>
          <DocumentList
            docs={knowledge.docs}
            busyDocIds={knowledge.busyDocIds}
            modelSelected={modelSelected}
            onEmbed={knowledge.embedOne}
            onDelete={knowledge.removeDoc}
          />
        </div>
      </div>
    </div>
  );
}
