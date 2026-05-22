import { useState, type Dispatch, type SetStateAction } from 'react';
import type { PromptTemplate, ModelParams } from '../../providers/types';
import { createTemplate, deleteTemplate } from '../../data/prompt-templates';
import { resetEverything } from '../../data/reset';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Dot } from '../ui/Dot';
import { ParamControls } from '../providers/ParamControls';
import { ImportExport } from './ImportExport';

type SettingsTab = 'templates' | 'providers' | 'params' | 'about';

const TABS: [SettingsTab, string][] = [
  ['templates', 'Prompt templates'],
  ['providers', 'Providers'],
  ['params', 'Chat defaults'],
  ['about', 'About'],
];

interface ProviderMeta {
  id: string;
  name: string;
  group: 'in-browser' | 'localhost' | 'byok';
  desc: string;
  builtIn?: boolean;
  phase?: number;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'webllm',
    name: 'WebLLM',
    group: 'in-browser',
    desc: "In-browser inference. Runs on this device's GPU via WebGPU.",
    builtIn: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    group: 'localhost',
    desc: 'Local Ollama daemon on localhost:11434.',
    phase: 2,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    group: 'localhost',
    desc: 'Local LM Studio server, OpenAI-compatible.',
    phase: 2,
  },
  {
    id: 'openai-compat',
    name: 'OpenAI-compatible API',
    group: 'byok',
    desc: 'Any /v1/chat/completions endpoint — Groq, OpenRouter, Together or a custom server.',
    phase: 2,
  },
];

function ProviderRow({ provider }: { provider: ProviderMeta }) {
  const live = !provider.phase;
  return (
    <div className="border border-line bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Dot tone={live ? 'ok' : 'mute'} />
        <span className="text-[13px] text-text shrink-0">{provider.name}</span>
        {provider.builtIn && (
          <Badge tone="neutral" mono>
            built-in
          </Badge>
        )}
        {provider.phase && (
          <Badge tone="neutral" mono>
            phase {provider.phase}
          </Badge>
        )}
        <span className={`font-mono text-[10px] ${live ? 'text-ok' : 'text-mute'}`}>
          {live ? 'ready' : 'coming soon'}
        </span>
        <div className="flex-1" />
        <span
          className={`font-mono text-[11px] px-2.5 py-1 border ${
            live ? 'border-accent/60 text-accent bg-accent/5' : 'border-line text-mute/50'
          }`}
        >
          {live ? 'enabled' : 'soon'}
        </span>
      </div>
      <div className="font-mono text-[10px] text-mute mt-1">{provider.desc}</div>
    </div>
  );
}

const GROUP_LABELS: Record<ProviderMeta['group'], string> = {
  'in-browser': 'in-browser',
  localhost: 'localhost daemons',
  byok: 'bring your own key (byok)',
};

export function SettingsModal({
  open,
  onClose,
  templates,
  setTemplates,
  globalDefaults,
  setGlobalDefaults,
  defaultSystemPrompt,
  setDefaultSystemPrompt,
}: {
  open: boolean;
  onClose: () => void;
  templates: PromptTemplate[];
  setTemplates: Dispatch<SetStateAction<PromptTemplate[]>>;
  globalDefaults: ModelParams;
  setGlobalDefaults: (patch: Partial<ModelParams>) => void;
  defaultSystemPrompt: string;
  setDefaultSystemPrompt: (value: string) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>('templates');
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [resetArmed, setResetArmed] = useState(false);
  const [resetText, setResetText] = useState('');

  const addTemplate = async () => {
    if (!draft.title.trim()) return;
    const t = await createTemplate({
      title: draft.title.trim(),
      content: draft.content,
      isBuiltIn: false,
    });
    setTemplates((prev) => [...prev, t]);
    setDraft({ title: '', content: '' });
  };

  const removeTemplate = async (id: string) => {
    await deleteTemplate(id);
    setTemplates((prev) => prev.filter((x) => x.id !== id));
  };

  const doReset = async () => {
    await resetEverything();
    window.location.reload();
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" width="max-w-3xl">
      <div className="flex border-b border-line">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`font-mono text-[11px] px-4 py-2.5 border-r border-line ${
              tab === id ? 'text-accent bg-accent/5' : 'text-mute hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'templates' && (
        <div className="p-4 space-y-4">
          <div className="space-y-1">
            {templates.map((t) => (
              <div
                key={t.id}
                className="group flex items-center gap-2 border border-line bg-surface px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[12px] text-text">/{t.title}</div>
                  <div className="font-mono text-[10px] text-mute truncate">
                    {t.content.replace(/\n/g, ' ').trim()}
                  </div>
                </div>
                {t.isBuiltIn ? (
                  <span className="font-mono text-[9px] text-mute shrink-0">built-in</span>
                ) : (
                  <button
                    onClick={() => removeTemplate(t.id)}
                    className="opacity-0 group-hover:opacity-100 font-mono text-[11px] text-mute hover:text-err shrink-0"
                  >
                    delete
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-line pt-4 space-y-2">
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest">
              new template
            </div>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Title (used as /trigger)"
              className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-1.5 text-[12px] font-mono"
            />
            <textarea
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder="Template content inserted into the composer…"
              rows={3}
              className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-2 text-[12px] resize-none"
            />
            <button
              onClick={addTemplate}
              className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10"
            >
              + add template
            </button>
          </div>
        </div>
      )}

      {tab === 'providers' && (
        <div className="p-4 space-y-4">
          <p className="text-[12.5px] text-mute leading-relaxed">
            Each provider exposes models from a different runtime. WebLLM runs today;
            localhost and BYOK providers arrive in Phase 2. BYOK keys will be stored in
            IndexedDB on this device — nothing leaves until you send a request.
          </p>
          {(['in-browser', 'localhost', 'byok'] as const).map((group) => (
            <div key={group}>
              <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
                {GROUP_LABELS[group]}
              </div>
              <div className="space-y-1.5">
                {PROVIDERS.filter((p) => p.group === group).map((p) => (
                  <ProviderRow key={p.id} provider={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'params' && (
        <div className="p-4 space-y-4">
          <div>
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-1.5">
              default system prompt
            </div>
            <textarea
              value={defaultSystemPrompt}
              onChange={(e) => setDefaultSystemPrompt(e.target.value)}
              rows={3}
              className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-2 text-[12.5px] text-text resize-none"
            />
            <div className="font-mono text-[10px] text-mute mt-1">
              Applied to new threads. Each thread's system prompt can then be edited
              independently.
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
              default generation parameters
            </div>
            <ParamControls params={globalDefaults} onChange={setGlobalDefaults} />
            <div className="font-mono text-[10px] text-mute mt-2">
              New threads inherit these. Each thread can override them independently.
            </div>
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div className="p-4 space-y-3 text-[12px] text-mute leading-relaxed">
          <div className="font-mono text-sm text-text">
            ht<span className="text-accent">&lt;llm&gt;</span>
          </div>
          <p>
            A fully client-side WebGPU chat app. No server, no telemetry. Threads,
            messages, settings and API keys live only in this browser's IndexedDB.
          </p>
          <div className="font-mono text-[11px] border-t border-line pt-3 space-y-1">
            <div>
              <span className="text-mute">runtime</span> · WebLLM · WebGPU
            </div>
            <div>
              <span className="text-mute">storage</span> · IndexedDB (local only)
            </div>
            <div>
              <span className="text-mute">providers</span> · WebLLM now · Ollama / LM Studio /
              OpenAI-compatible next
            </div>
          </div>

          <ImportExport />

          <div className="border border-err/40 bg-err/5 p-3">
            <div className="font-mono text-[10px] text-err uppercase tracking-widest mb-1.5">
              danger zone
            </div>
            <p className="text-[12px] text-mute leading-relaxed">
              Reset everything permanently deletes all conversations, prompt templates,
              cached model weights, API keys and settings from this browser. This cannot
              be undone — export your data first if you want a backup.
            </p>
            {!resetArmed ? (
              <button
                onClick={() => setResetArmed(true)}
                className="mt-2.5 font-mono text-[11px] px-3 py-1.5 border border-err/50 text-err hover:bg-err/10"
              >
                Reset everything
              </button>
            ) : (
              <div className="mt-2.5 space-y-2">
                <div className="font-mono text-[10px] text-mute">
                  Type <span className="text-err">reset</span> to confirm.
                </div>
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={resetText}
                    onChange={(e) => setResetText(e.target.value)}
                    placeholder="reset"
                    className="flex-1 bg-bg border border-line focus:border-err/60 focus:outline-none px-2.5 py-1 text-[12px] font-mono"
                  />
                  <button
                    disabled={resetText !== 'reset'}
                    onClick={doReset}
                    className="font-mono text-[11px] px-3 py-1.5 border border-err/60 text-err bg-err/10 hover:bg-err/20 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    wipe everything →
                  </button>
                  <button
                    onClick={() => {
                      setResetArmed(false);
                      setResetText('');
                    }}
                    className="font-mono text-[11px] px-3 py-1.5 border border-line text-mute hover:text-text"
                  >
                    cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
