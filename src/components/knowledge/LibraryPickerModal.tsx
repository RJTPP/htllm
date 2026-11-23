import { Check, Plus, AlertTriangle, Cloud, HardDrive, Ban } from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { LibraryWithStats } from '../../hooks/useKnowledge';
import { localityOf } from '../../lib/network';
import { getProvider } from '../../providers/registry';
import { OpenAICompatibleProvider } from '../../providers/openai-compat/index';

/**
 * Library switcher modal. Replaces the inline popover so library
 * selection feels consistent with the chat ModelPicker and embedding
 * picker — same Modal shell, same esc-to-close, same portal so it
 * escapes ancestor stacking contexts.
 *
 * Rows surface the same metadata as the active library bar (doc count,
 * pinned model, locality) so users can pick without leaving the
 * Knowledge page to inspect.
 *
 * When `allowNone` is true, a "None" row at the top lets the caller
 * clear the selection — used by the chat knowledge chip and the
 * Settings default-library picker, where "no library" means "no RAG".
 */
export function LibraryPickerModal({
  open,
  onClose,
  libraries,
  activeLibraryId,
  onSelect,
  onNewLibrary,
  allowNone = false,
  title = 'Switch library',
  noneLabel = 'None — disable retrieval',
}: {
  open: boolean;
  onClose: () => void;
  libraries: LibraryWithStats[];
  /** Currently-bound library id; `null` indicates "None" is active when allowNone. */
  activeLibraryId: string | null;
  /** Called with a library id, or `null` when "None" is chosen. */
  onSelect: (id: string | null) => void;
  onNewLibrary: () => void;
  allowNone?: boolean;
  title?: string;
  noneLabel?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={
        libraries.length === 1
          ? '1 library'
          : `${libraries.length} libraries`
      }
      width="max-w-lg"
    >
      <div className="flex flex-col">
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {allowNone && (
            <NoneRow
              label={noneLabel}
              isActive={activeLibraryId === null}
              onSelect={() => {
                onSelect(null);
                onClose();
              }}
            />
          )}
          {libraries.map((entry) => (
            <LibraryRow
              key={entry.lib.id}
              entry={entry}
              isActive={entry.lib.id === activeLibraryId}
              onSelect={() => {
                onSelect(entry.lib.id);
                onClose();
              }}
            />
          ))}
        </div>
        <button
          onClick={() => {
            onClose();
            onNewLibrary();
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 border-t border-line font-mono text-[11px] text-accent hover:bg-accent/10 transition-colors"
        >
          <Plus size={12} /> New library
        </button>
      </div>
    </Modal>
  );
}

function NoneRow({
  label,
  isActive,
  onSelect,
}: {
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 border transition-colors ${
        isActive
          ? 'border-accent/60 bg-accent/10'
          : 'border-line bg-surface hover:border-line-hi'
      }`}
    >
      <div className="flex items-center gap-2">
        <Ban size={12} className="text-mute shrink-0" />
        <span className="font-mono text-[12.5px] text-text flex-1">{label}</span>
        {isActive && <Check size={13} className="text-accent shrink-0" />}
      </div>
    </button>
  );
}

function LibraryRow({
  entry,
  isActive,
  onSelect,
}: {
  entry: LibraryWithStats;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { lib, docCount, chunkCount } = entry;
  const hasModel = Boolean(lib.embeddingModelId);
  const provider = lib.embeddingProviderId ? getProvider(lib.embeddingProviderId) : null;
  const baseURL =
    provider instanceof OpenAICompatibleProvider ? provider.getConfig().baseURL : '';
  const locality = localityOf(baseURL);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 border transition-colors ${
        isActive
          ? 'border-accent/60 bg-accent/10'
          : 'border-line bg-surface hover:border-line-hi'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-text flex-1 truncate">{lib.name}</span>
        {isActive && <Check size={13} className="text-accent shrink-0" />}
      </div>
      <div className="flex items-center gap-2 font-mono text-[10.5px] text-mute mt-0.5">
        <span className="shrink-0">
          {docCount} doc{docCount === 1 ? '' : 's'} · {chunkCount} chunk
          {chunkCount === 1 ? '' : 's'}
        </span>
        {hasModel ? (
          <>
            <span className="text-mute/50">·</span>
            <span className="truncate">{lib.embeddingModelId}</span>
            {locality === 'off-device' && <Cloud size={10} className="shrink-0" />}
            {locality === 'on-device' && <HardDrive size={10} className="shrink-0" />}
          </>
        ) : (
          <>
            <span className="text-mute/50">·</span>
            <AlertTriangle size={10} className="text-warn shrink-0" />
            <span className="text-warn shrink-0">no model</span>
          </>
        )}
      </div>
    </button>
  );
}
