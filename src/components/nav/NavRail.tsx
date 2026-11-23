import type { LucideIcon } from 'lucide-react';
import { MessageCircle, Database, HardDrive, Settings } from 'lucide-react';

export type NavPage = 'chat' | 'knowledge' | 'storage';

const LIVE: [NavPage, LucideIcon, string][] = [
  ['chat', MessageCircle, 'Chat'],
  ['knowledge', Database, 'Knowledge'],
  ['storage', HardDrive, 'Storage'],
];


export function NavRail({
  page,
  setPage,
  onOpenSettings,
}: {
  page: NavPage;
  setPage: (p: NavPage) => void;
  onOpenSettings: () => void;
}) {
  return (
    <nav className="reveal w-[68px] shrink-0 border-r border-line bg-bg flex flex-col items-center py-3">
      <div className="font-mono font-medium text-[10px] text-text mb-4">
        ht<span className="text-accent">&lt;llm&gt;</span>
      </div>
      <div className="flex-1 flex flex-col gap-1 w-full px-2 overflow-y-auto">
        {LIVE.map(([id, Ico, label]) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`flex flex-col items-center gap-1 py-2 border transition-colors ${
              page === id
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-transparent text-mute hover:text-text hover:bg-surface2'
            }`}
          >
            <Ico size={18} />
            <span className="font-mono text-[9px]">{label}</span>
          </button>
        ))}
      </div>
      <button
        onClick={onOpenSettings}
        className="flex flex-col items-center gap-1 py-2 w-[52px] border border-transparent text-mute hover:text-text hover:bg-surface2"
      >
        <Settings size={18} />
        <span className="font-mono text-[9px]">Settings</span>
      </button>
    </nav>
  );
}
