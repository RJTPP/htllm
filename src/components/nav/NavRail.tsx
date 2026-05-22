import { Icon } from '../ui/Icon';

export type NavPage = 'chat' | 'knowledge' | 'storage';

const LIVE: [NavPage, string, string][] = [
  ['chat', 'chat', 'Chat'],
  ['knowledge', 'knowledge', 'Knowledge'],
  ['storage', 'storage', 'Storage'],
];

const PLANNED: [string, string, string, number][] = [
  ['fn', 'fn', 'Functions', 4],
  ['agent', 'agent', 'Agents', 4],
  ['artifact', 'artifact', 'Artifacts', 5],
  ['vectormap', 'vectormap', 'Vector map', 5],
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
        {LIVE.map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`flex flex-col items-center gap-1 py-2 border transition-colors ${
              page === id
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-transparent text-mute hover:text-text hover:bg-surface2'
            }`}
          >
            <Icon name={icon} size={18} />
            <span className="font-mono text-[9px]">{label}</span>
          </button>
        ))}
        <div className="h-px bg-line my-2 mx-1.5" />
        <div className="font-mono text-[8px] uppercase tracking-widest text-mute/60 text-center mb-0.5">
          planned
        </div>
        {PLANNED.map(([id, icon, label, phase]) => (
          <div
            key={id}
            title={`${label} — phase ${phase}`}
            className="flex flex-col items-center gap-1 py-2 border border-transparent text-mute/40 cursor-not-allowed relative"
          >
            <Icon name={icon} size={16} />
            <span className="font-mono text-[9px]">{label}</span>
            <span className="absolute top-1 right-1 font-mono text-[8px] text-mute/50 border border-line/60 px-1 leading-tight">
              p{phase}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={onOpenSettings}
        className="flex flex-col items-center gap-1 py-2 w-[52px] border border-transparent text-mute hover:text-text hover:bg-surface2"
      >
        <Icon name="settings" size={18} />
        <span className="font-mono text-[9px]">Settings</span>
      </button>
    </nav>
  );
}
