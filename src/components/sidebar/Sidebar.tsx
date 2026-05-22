import type { Thread } from '../../providers/types';
import { shortenModelId } from '../../lib/format';
import { ThreadList } from './ThreadList';

export function Sidebar({
  threads,
  activeThreadId,
  loadedModelId,
  onOpenPicker,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
}: {
  threads: Thread[];
  activeThreadId: string | null;
  loadedModelId: string | null;
  onOpenPicker: () => void;
  onCreateThread: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full w-64 border-r border-line bg-surface">
      <div className="px-3 py-3 border-b border-line">
        <div className="font-mono text-sm text-text tracking-wide">
          ht<span className="text-accent">[LLM]</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ThreadList
          threads={threads}
          activeId={activeThreadId}
          onCreate={onCreateThread}
          onSelect={onSelectThread}
          onDelete={onDeleteThread}
        />
      </div>

      <div className="border-t border-line">
        <button
          onClick={onOpenPicker}
          className="w-full px-3 py-2.5 text-left hover:bg-surface2 transition-colors"
        >
          <div className="font-mono text-[10px] text-mute uppercase tracking-widest">
            model
          </div>
          <div className="font-mono text-[12px] text-text mt-0.5">
            {loadedModelId ? shortenModelId(loadedModelId) : 'no model loaded'}
          </div>
        </button>
      </div>
    </div>
  );
}
