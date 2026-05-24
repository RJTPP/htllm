import { useState } from 'react';
import { BookOpen, AlertTriangle } from 'lucide-react';
import { LibraryPickerModal } from '../knowledge/LibraryPickerModal';
import type { LibraryWithStats } from '../../hooks/useKnowledge';

/**
 * Composer-footer chip that exposes the chat's RAG binding. Click to
 * open a LibraryPickerModal (with a "None" row so users can turn RAG
 * off without leaving the chat). Library presence IS the on/off state.
 *
 * Three visual modes:
 *   - off:        muted "knowledge: off"
 *   - on, model pinned:   accent "knowledge: <library name>"
 *   - on, no model:       warn  "knowledge: <library name> · no model"
 *
 * The warn mode surfaces a real configuration gap — the library has no
 * embedding model so retrieval will silently no-op every turn.
 */
export function KnowledgeChip({
  libraryId,
  libraries,
  onSelect,
  onNewLibrary,
}: {
  libraryId: string | null;
  libraries: LibraryWithStats[];
  onSelect: (id: string | null) => void;
  onNewLibrary: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const boundLibrary = libraryId
    ? libraries.find((l) => l.lib.id === libraryId)?.lib ?? null
    : null;
  const isOn = boundLibrary !== null;
  const modelPinned = Boolean(boundLibrary?.embeddingModelId);
  const broken = isOn && !modelPinned;

  // Truncate long library names so the chip stays the same shape as
  // the reasoning effort chip alongside it.
  const displayName = boundLibrary
    ? boundLibrary.name.length > 18
      ? `${boundLibrary.name.slice(0, 18)}…`
      : boundLibrary.name
    : 'off';

  const className = broken
    ? 'border-warn/60 text-warn bg-warn/5 hover:bg-warn/10'
    : isOn
      ? 'border-accent/60 text-accent bg-accent/10 hover:bg-accent/20'
      : 'border-line text-mute/70 hover:text-mute';

  const title = !isOn
    ? 'Click to bind this chat to a library for retrieval (RAG)'
    : broken
      ? `Library "${boundLibrary?.name}" has no embedding model pinned — RAG will silently skip until you set one in the Knowledge page`
      : `Retrieving from "${boundLibrary?.name}" via ${boundLibrary?.embeddingModelId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        title={title}
        className={`flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border transition-colors ${className}`}
      >
        {broken ? <AlertTriangle size={10} /> : <BookOpen size={10} />}
        <span className="text-mute/60">knowledge:</span>
        <span>{displayName}</span>
      </button>

      <LibraryPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        libraries={libraries}
        activeLibraryId={libraryId}
        allowNone
        title="Knowledge for this chat"
        noneLabel="Off — don't retrieve any documents"
        onSelect={(id) => {
          onSelect(id);
          setPickerOpen(false);
        }}
        onNewLibrary={onNewLibrary}
      />
    </>
  );
}
