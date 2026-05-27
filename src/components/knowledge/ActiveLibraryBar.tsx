import { useState } from 'react';
import { Cloud, HardDrive, AlertTriangle, Sparkles } from 'lucide-react';
import type { LibraryWithStats } from '../../hooks/useKnowledge';
import { localityOf } from '../../lib/network';
import { getProvider } from '../../providers/registry';
import { OpenAICompatibleProvider } from '../../providers/openai-compat/index';
import { LibraryPickerModal } from './LibraryPickerModal';

/**
 * Active library status header — reads like a compile-time manifest
 * instead of a sentence. Two aligned key:value rows (LIBRARY / INDEX),
 * stats inline, action affordances right-edge. Amber warn variant when
 * a library has no embedding model pinned.
 *
 * The library popover is intentionally inline (not a Modal) because it's
 * a quick switcher: click name → list → pick → done. Modals are for
 * substantial flows; this is a one-tap context shift.
 */
export function ActiveLibraryBar({
  libraries,
  activeLibraryId,
  onSelectLibrary,
  onNewLibrary,
  onChangeModel,
}: {
  libraries: LibraryWithStats[];
  activeLibraryId: string;
  onSelectLibrary: (id: string) => void;
  onNewLibrary: () => void;
  onChangeModel: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const active = libraries.find((l) => l.lib.id === activeLibraryId);
  if (!active) return null;

  const { lib, docCount, chunkCount } = active;
  const hasModel = Boolean(lib.embeddingModelId);

  // Resolve locality from the pinned provider's configured baseURL —
  // same source the Embedding picker uses, kept consistent.
  const provider = lib.embeddingProviderId ? getProvider(lib.embeddingProviderId) : null;
  const baseURL =
    provider instanceof OpenAICompatibleProvider ? provider.getConfig().baseURL : '';
  const locality = localityOf(baseURL);

  return (
    <div className="relative">
      <div className="border border-line bg-surface/40 divide-y divide-line/40">
        {/* LIBRARY row — the noun. Clickable name opens the switcher. */}
        <div className="flex items-center gap-3 px-3 py-2">
          <Key>library</Key>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="font-mono text-[13px] text-text hover:text-accent transition-colors"
          >
            {lib.name}
          </button>
          {lib.useContextualRetrieval && (
            <span
              title="Contextual retrieval enabled — embeddings include a chat-model-generated situating blurb per chunk"
              className="shrink-0 inline-flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-wider text-accent border border-accent/40 bg-accent/5 px-1 leading-[14px]"
            >
              <Sparkles size={9} />ctx
            </span>
          )}
          <span className="font-mono text-[10.5px] text-mute truncate">
            · {docCount} doc{docCount === 1 ? '' : 's'}, {chunkCount} chunk
            {chunkCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="ml-auto font-mono text-[10px] text-mute hover:text-accent flex items-center gap-0.5 shrink-0"
          >
            <span className="text-mute/60">▸</span> switch
          </button>
        </div>

        {/* INDEX row — implementation detail. Warn variant when unpinned. */}
        <div className="flex items-center gap-3 px-3 py-2">
          <Key>index</Key>
          {hasModel ? (
            <>
              <button
                type="button"
                onClick={onChangeModel}
                className="font-mono text-[13px] text-text hover:text-accent transition-colors truncate"
                title="Change embedding model"
              >
                {lib.embeddingModelId}
              </button>
              <span className="font-mono text-[10.5px] text-mute flex items-center gap-1 shrink-0">
                ·
                {locality === 'on-device' ? (
                  <HardDrive size={10} className="text-mute" />
                ) : locality === 'off-device' ? (
                  <Cloud size={10} className="text-mute" />
                ) : null}
                {locality === 'on-device' ? 'on-device' : locality === 'off-device' ? 'cloud' : ''}
              </span>
              <button
                type="button"
                onClick={onChangeModel}
                className="ml-auto font-mono text-[10px] text-mute hover:text-accent flex items-center gap-0.5 shrink-0"
              >
                <span className="text-mute/60">▸</span> change
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 font-mono text-[12.5px] text-warn">
                <AlertTriangle size={11} />
                no model pinned
              </span>
              <span className="font-mono text-[10.5px] text-mute/80 truncate">
                · documents can&apos;t be searched until you pick one
              </span>
              <button
                type="button"
                onClick={onChangeModel}
                className="ml-auto flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 border border-warn/60 text-warn hover:bg-warn/10 shrink-0"
              >
                pin model
              </button>
            </>
          )}
        </div>
      </div>

      <LibraryPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        libraries={libraries}
        activeLibraryId={activeLibraryId}
        // Library bar never lets the user clear — there's always an
        // active library on the Documents tab. allowNone defaults to false.
        onSelect={(id) => id && onSelectLibrary(id)}
        onNewLibrary={onNewLibrary}
      />
    </div>
  );
}

/** The aligned uppercase mute-mono label that fronts each row. */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] text-mute uppercase tracking-widest w-14 shrink-0">
      {children}
    </span>
  );
}
