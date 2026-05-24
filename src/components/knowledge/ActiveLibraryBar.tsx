import { useState } from 'react';
import { Cloud, HardDrive, AlertTriangle, Plus, Check } from 'lucide-react';
import type { LibraryWithStats } from '../../hooks/useKnowledge';
import { localityOf } from '../../lib/network';
import { getProvider } from '../../providers/registry';
import { OpenAICompatibleProvider } from '../../providers/openai-compat/index';

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
  const [popoverOpen, setPopoverOpen] = useState(false);

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
            onClick={() => setPopoverOpen((o) => !o)}
            className="font-mono text-[13px] text-text hover:text-accent transition-colors"
          >
            {lib.name}
          </button>
          <span className="font-mono text-[10.5px] text-mute truncate">
            · {docCount} doc{docCount === 1 ? '' : 's'}, {chunkCount} chunk
            {chunkCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => setPopoverOpen((o) => !o)}
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

      {/* Library switcher popover — click-outside to dismiss. Intentionally
          inline + lightweight; this is a single-tap context shift, not a
          flow worth a full Modal. */}
      {popoverOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setPopoverOpen(false)}
          />
          <div className="absolute z-40 mt-1 left-3 right-3 max-w-md border border-line bg-bg shadow-lg">
            <div className="px-3 py-1.5 border-b border-line/60 font-mono text-[10px] text-mute uppercase tracking-widest">
              switch library · {libraries.length}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {libraries.map((entry) => {
                const isActive = entry.lib.id === activeLibraryId;
                return (
                  <button
                    key={entry.lib.id}
                    onClick={() => {
                      onSelectLibrary(entry.lib.id);
                      setPopoverOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 border-l-2 transition-colors ${
                      isActive
                        ? 'border-accent bg-accent/5'
                        : 'border-transparent hover:bg-surface2'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-text flex-1 truncate">
                        {entry.lib.name}
                      </span>
                      {isActive && <Check size={11} className="text-accent shrink-0" />}
                    </div>
                    <div className="font-mono text-[10px] text-mute mt-0.5 truncate">
                      {entry.docCount} doc{entry.docCount === 1 ? '' : 's'}
                      {entry.lib.embeddingModelId ? (
                        <> · {entry.lib.embeddingModelId}</>
                      ) : (
                        <span className="text-warn"> · no model</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                setPopoverOpen(false);
                onNewLibrary();
              }}
              className="w-full flex items-center gap-1.5 px-3 py-2 border-t border-line/60 font-mono text-[11px] text-accent hover:bg-accent/10 transition-colors"
            >
              <Plus size={12} /> New library
            </button>
          </div>
        </>
      )}
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
