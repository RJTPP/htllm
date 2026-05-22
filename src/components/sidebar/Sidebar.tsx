import type { Thread } from '../../providers/types';
import { Icon } from '../ui/Icon';
import { ThreadItem } from './ThreadItem';

export function Sidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: {
  threads: Thread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  return (
    <aside className="reveal reveal-2 w-[248px] shrink-0 border-r border-line bg-surface flex flex-col">
      <div className="px-3 py-2.5">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 font-mono text-[11px] px-2.5 py-2 border border-line text-text bg-bg hover:border-accent/50 hover:text-accent transition-colors"
        >
          <Icon name="plus" size={13} /> new chat
        </button>
      </div>
      <div className="px-3 pb-1 font-mono text-[10px] text-mute uppercase tracking-widest">
        threads · {threads.length}
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-0.5">
        {threads.map((t) => (
          <ThreadItem
            key={t.id}
            thread={t}
            active={t.id === activeId}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))}
        {threads.length === 0 && (
          <div className="px-2.5 py-6 font-mono text-[11px] text-mute text-center">
            No threads yet
          </div>
        )}
      </div>
    </aside>
  );
}
