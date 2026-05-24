import { useState, useMemo } from 'react';
import { Search, FileText, Plus, Upload, Sparkles, Trash2 } from 'lucide-react';
import { useKnowledge } from '../../hooks/useKnowledge';
import { ActiveLibraryBar } from './ActiveLibraryBar';
import { LibraryList } from './LibraryList';
import { DocumentDetail } from './DocumentDetail';
import { NewLibraryModal } from './NewLibraryModal';
import { AddDocumentsModal } from './AddDocumentsModal';
import { EmbeddingProgress } from './EmbeddingProgress';
import { SemanticSearch } from './SemanticSearch';
import { EmbeddingModelModal } from './EmbeddingModelSelector';
import { getEmbeddingProvider } from '../../providers/registry';

type Tab = 'search' | 'documents';

/**
 * Top-level Knowledge page — replaces the flat-list prototype. Two tabs:
 *
 *   - Global search: semantic + BM25 across the active library
 *   - Documents:     3-column layout (libraries | docs | preview)
 *
 * Libraries are first-class; every document belongs to one. The active
 * library's pinned embedding model drives embedding and search.
 */
export function KnowledgePage() {
  const knowledge = useKnowledge();

  const [tab, setTab] = useState<Tab>('search');
  const [newLibraryOpen, setNewLibraryOpen] = useState(false);
  const [addDocsOpen, setAddDocsOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const activeLibrary = knowledge.activeLibrary;

  // Default selection: first doc in the active library, reset on library change.
  const selectedDoc = useMemo(() => {
    if (knowledge.docs.length === 0) return null;
    return (
      knowledge.docs.find((d) => d.doc.id === selectedDocId) ?? knowledge.docs[0] ?? null
    );
  }, [knowledge.docs, selectedDocId]);

  const ragReady =
    Boolean(activeLibrary?.embeddingModelId) &&
    knowledge.docs.some((d) => d.status === 'full' || d.status === 'partial');

  // Handle library model rebinding from the inline "change" affordance.
  const handlePickLibraryModel = async (providerId: string, modelId: string) => {
    if (!activeLibrary) return;
    await knowledge.editLibrary(activeLibrary.id, {
      embeddingProviderId: providerId,
      embeddingModelId: modelId,
    });
    setModelPickerOpen(false);
  };

  return (
    <div className="flex-1 grid-bg flex flex-col min-h-0">
      {/* Non-scrolling top region — header + status bar + tabs stay
          anchored while the body scrolls underneath. Header collapsed
          to a single row to reclaim vertical for the 3-column body —
          the nav rail already identifies the page. */}
      <div className="max-w-7xl mx-auto w-full px-6 pt-5 pb-3 space-y-3 shrink-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-mono text-base font-medium tracking-tight">Your documents</h1>
          <p className="font-mono text-[10px] text-mute uppercase tracking-widest">
            semantic search · per-file inspection · RAG context
          </p>
        </div>

        {/* Active library bar — brutalist manifest header, status + actions. */}
        {activeLibrary && (
          <ActiveLibraryBar
            libraries={knowledge.libraries}
            activeLibraryId={knowledge.activeLibraryId}
            onSelectLibrary={(id) => {
              knowledge.setActiveLibraryId(id);
              setSelectedDocId(null);
            }}
            onNewLibrary={() => setNewLibraryOpen(true)}
            onChangeModel={() => setModelPickerOpen(true)}
          />
        )}

        {/* Tabs + actions row — actions are always visible across both
            tabs so the user can add docs from the search view too. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            <TabButton
              icon={<Search size={13} />}
              label="Global search"
              active={tab === 'search'}
              onClick={() => setTab('search')}
            />
            <TabButton
              icon={<FileText size={13} />}
              label="Documents"
              active={tab === 'documents'}
              onClick={() => setTab('documents')}
            />
          </div>
          <div className="flex items-center gap-2">
            {tab === 'documents' &&
              activeLibrary &&
              activeLibrary.embeddingModelId && (
                <button
                  onClick={knowledge.embedAll}
                  disabled={knowledge.progress !== null}
                  className="flex items-center gap-1 font-mono text-[11px] px-2.5 py-1.5 border border-line text-mute hover:text-accent hover:border-accent/40 disabled:opacity-30"
                >
                  <Sparkles size={12} /> embed all
                </button>
              )}
            <button
              onClick={() => setNewLibraryOpen(true)}
              className="flex items-center gap-1 font-mono text-[11px] px-2.5 py-1.5 border border-line text-mute hover:text-accent hover:border-accent/40"
            >
              <Plus size={12} /> New library
            </button>
            <button
              onClick={() => setAddDocsOpen(true)}
              className="flex items-center gap-1 font-mono text-[11px] px-2.5 py-1.5 border border-accent/60 text-accent hover:bg-accent/10"
            >
              <Upload size={12} /> Add documents
            </button>
          </div>
        </div>

        {/* Embedding progress + error banner — visible across both tabs. */}
        <EmbeddingProgress progress={knowledge.progress} />
        {knowledge.error && (
          <div className="font-mono text-[10px] text-err border border-err/40 bg-err/5 px-3 py-2">
            {knowledge.error}
          </div>
        )}
      </div>

      {/* Tab body — owns the remaining vertical so internal columns
          (libraries / docs / preview) scroll independently of the page
          header. flex-1 + min-h-0 is the canonical "fill the rest" recipe
          for a flex-column parent. */}
      <div className="max-w-7xl mx-auto w-full px-6 pb-8 flex-1 min-h-0 flex flex-col">
        {tab === 'search' ? (
          <SearchPane
            providerId={activeLibrary?.embeddingProviderId ?? null}
            modelId={activeLibrary?.embeddingModelId ?? null}
            libraries={knowledge.libraries}
            activeLibraryId={knowledge.activeLibraryId}
            ready={ragReady}
          />
        ) : (
          <div className="flex border border-line bg-surface/30 flex-1 min-h-[480px] min-w-0">
            <LibraryList
              libraries={knowledge.libraries}
              activeLibraryId={knowledge.activeLibraryId}
              onSelect={(id) => {
                knowledge.setActiveLibraryId(id);
                setSelectedDocId(null);
              }}
              onNew={() => setNewLibraryOpen(true)}
              onRemove={(id) => knowledge.removeLibrary(id)}
              onEmbedAll={(id) => knowledge.embedAllForLibrary(id)}
            />
            <DocumentsColumn
              docs={knowledge.docs}
              busyDocIds={knowledge.busyDocIds}
              selectedDocId={selectedDoc?.doc.id ?? null}
              onSelect={(id) => setSelectedDocId(id)}
              onAdd={() => setAddDocsOpen(true)}
              onEmbed={(id) => knowledge.embedOne(id)}
              onRemove={(id) => {
                knowledge.removeDoc(id);
                if (selectedDoc?.doc.id === id) setSelectedDocId(null);
              }}
              modelPinned={Boolean(activeLibrary?.embeddingModelId)}
            />
            <DocumentDetail
              selected={selectedDoc}
              busy={selectedDoc ? knowledge.busyDocIds.has(selectedDoc.doc.id) : false}
              modelPinned={Boolean(activeLibrary?.embeddingModelId)}
              onEmbed={() => selectedDoc && knowledge.embedOne(selectedDoc.doc.id)}
              onRemove={() => {
                if (!selectedDoc) return;
                knowledge.removeDoc(selectedDoc.doc.id);
                setSelectedDocId(null);
              }}
            />
          </div>
        )}
      </div>

      <NewLibraryModal
        open={newLibraryOpen}
        onClose={() => setNewLibraryOpen(false)}
        defaultProviderId={null}
        defaultModelId={null}
        onCreate={(input) => knowledge.createLibrary(input)}
      />

      <AddDocumentsModal
        open={addDocsOpen}
        onClose={() => setAddDocsOpen(false)}
        libraries={knowledge.libraries}
        defaultLibraryId={knowledge.activeLibraryId}
        onUpload={knowledge.uploadFiles}
      />

      <EmbeddingModelModal
        open={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        activeProviderId={activeLibrary?.embeddingProviderId ?? null}
        activeModelId={activeLibrary?.embeddingModelId ?? null}
        onSelect={handlePickLibraryModel}
      />
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 border text-[12px] transition-colors ${
        active
          ? 'border-accent/60 bg-accent/10 text-text'
          : 'border-line text-mute hover:text-text'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Middle column — list of docs in the active library. Adding files
 * happens through the AddDocumentsModal, so this column stays focused
 * on browsing/selection. The header gets a small `+` shortcut to open
 * the modal pre-targeted to the active library.
 */
function DocumentsColumn({
  docs,
  busyDocIds,
  selectedDocId,
  onSelect,
  onAdd,
  onEmbed,
  onRemove,
  modelPinned,
}: {
  docs: ReturnType<typeof useKnowledge>['docs'];
  busyDocIds: Set<string>;
  selectedDocId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEmbed: (id: string) => void;
  onRemove: (id: string) => void;
  /** Library has a model pinned; gates the per-row embed action. */
  modelPinned: boolean;
}) {
  return (
    <div className="flex flex-col border-r border-line min-w-[260px] w-[300px]">
      <div className="px-3 py-2 border-b border-line flex items-center justify-between">
        <span className="font-mono text-[10px] text-mute uppercase tracking-widest">
          documents · {docs.length}
        </span>
        <button
          onClick={onAdd}
          title="Add documents to this library"
          className="text-mute hover:text-accent"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {docs.length === 0 ? (
          <button
            onClick={onAdd}
            className="w-full px-3 py-6 font-mono text-[10px] text-mute text-center hover:bg-surface2/50 hover:text-text transition-colors"
          >
            empty — click to add documents
          </button>
        ) : (
          docs.map(({ doc, status, embeddedChunks }) => {
            const selected = doc.id === selectedDocId;
            const busy = busyDocIds.has(doc.id);
            const subtitle =
              status === 'partial'
                ? `${embeddedChunks}/${doc.chunkCount} embedded`
                : status === 'full'
                  ? 'embedded'
                  : status === 'none'
                    ? 'not embedded'
                    : status;
            const showEmbedAction =
              modelPinned && (status === 'none' || status === 'partial') && !busy;
            return (
              <div
                key={doc.id}
                className={`group relative border-l-2 ${
                  selected
                    ? 'border-accent bg-surface2'
                    : 'border-transparent hover:bg-surface2/50'
                }`}
              >
                <button
                  onClick={() => onSelect(doc.id)}
                  className="w-full text-left px-3 py-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0 pr-6">
                    <FileText size={12} className="text-mute shrink-0" />
                    <span className="text-[12px] text-text truncate">{doc.filename}</span>
                  </div>
                  <div className="font-mono text-[10px] text-mute mt-0.5">
                    {doc.chunkCount} chunks · {subtitle}
                    {busy && ' · …'}
                  </div>
                </button>
                {/* Hover-revealed row actions — embed (when applicable)
                    + delete. Same gesture as the library row to keep the
                    interactions consistent. */}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {showEmbedAction && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEmbed(doc.id);
                      }}
                      title="Embed this document"
                      className="p-1 text-mute/70 hover:text-accent"
                    >
                      <Sparkles size={11} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(doc.id);
                    }}
                    title="Remove document"
                    disabled={busy}
                    className="p-1 text-mute/60 hover:text-err disabled:opacity-30"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Search tab — owns the EmbeddingProvider resolution and forwards
 *  libraries down so SemanticSearch can render scope chips. */
function SearchPane({
  providerId,
  modelId,
  libraries,
  activeLibraryId,
  ready,
}: {
  providerId: string | null;
  modelId: string | null;
  libraries: ReturnType<typeof useKnowledge>['libraries'];
  activeLibraryId: string;
  ready: boolean;
}) {
  const provider = providerId ? getEmbeddingProvider(providerId) ?? null : null;
  return (
    <SemanticSearch
      provider={provider}
      modelId={modelId}
      libraries={libraries}
      activeLibraryId={activeLibraryId}
      ready={ready}
    />
  );
}
