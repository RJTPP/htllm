import { Check, Plus, AlertTriangle, Cloud, HardDrive } from 'lucide-react';
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
 */
export function LibraryPickerModal({
  open,
  onClose,
  libraries,
  activeLibraryId,
  onSelect,
  onNewLibrary,
}: {
  open: boolean;
  onClose: () => void;
  libraries: LibraryWithStats[];
  activeLibraryId: string;
  onSelect: (id: string) => void;
  onNewLibrary: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Switch library"
      subtitle={
        libraries.length === 1
          ? '1 library'
          : `${libraries.length} libraries`
      }
      width="max-w-lg"
    >
      <div className="flex flex-col">
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
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
