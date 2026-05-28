import { useState, memo, type Dispatch, type SetStateAction } from 'react';
import type { PromptTemplate, ModelParams } from '../../providers/types';
import { createTemplate, deleteTemplate, updateTemplate } from '../../data/prompt-templates';
import { type TitleMode, type AccentColor, type CompressionMode, ACCENT_PRESETS } from '../../data/settings';
import { resetEverything } from '../../data/reset';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Dot } from '../ui/Dot';
import { ParamControls } from '../providers/ParamControls';
import { ProviderLogo } from '../ui/ProviderLogo';
import { ImportExport } from './ImportExport';
import { ProviderConfig } from './ProviderConfig';
import { getHttpProviders } from '../../providers/registry';
import { CODE_THEMES } from '../../lib/highlight';
import { MessageBody } from '../chat/MessageBody';
import { useLibraries } from '../../hooks/useLibraries';
import { LibraryPickerModal } from '../knowledge/LibraryPickerModal';
import { Pencil, AlertTriangle } from 'lucide-react';

const THEME_PREVIEW_SAMPLE = [
  '```typescript',
  'function greet(name: string): string {',
  '  const msg = `Hello, ${name}!`;',
  '  return msg; // a friendly greeting',
  '}',
  '```',
].join('\n');

/**
 * Knowledge settings — currently just the default library new chats
 * inherit. Future RAG knobs (top-K, min score, max context chars) can
 * live here too.
 */
function KnowledgeSettingsPanel({
  defaultLibraryId,
  setDefaultLibraryId,
  rememberLastLibrary,
  setRememberLastLibrary,
}: {
  defaultLibraryId: string | null;
  setDefaultLibraryId: (id: string | null) => void;
  rememberLastLibrary: boolean;
  setRememberLastLibrary: (value: boolean) => void;
}) {
  const { libraries } = useLibraries();
  const [pickerOpen, setPickerOpen] = useState(false);

  const bound = defaultLibraryId
    ? libraries.find((l) => l.lib.id === defaultLibraryId)?.lib ?? null
    : null;

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <div>
          <div className="font-mono text-[10px] text-mute uppercase tracking-widest">
            default library for new chats
          </div>
          <p className="font-mono text-[10px] text-mute/80 leading-relaxed mt-1 max-w-prose">
            When set, every new chat starts bound to this library so RAG
            retrieval works without picking one per-thread. Leave unset to
            keep RAG opt-in per chat (each new chat starts with "off").
          </p>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center justify-between gap-2 bg-surface border border-line hover:border-accent/40 px-3 py-2 text-left transition-colors"
        >
          {bound ? (
            <span className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[12.5px] text-text truncate">{bound.name}</span>
              {bound.embeddingModelId ? (
                <span className="font-mono text-[10px] text-mute truncate">
                  · {bound.embeddingModelId}
                </span>
              ) : (
                <span className="font-mono text-[10px] text-warn flex items-center gap-1">
                  <AlertTriangle size={10} /> no model pinned
                </span>
              )}
            </span>
          ) : (
            <span className="font-mono text-[12.5px] text-mute">
              None — new chats start with RAG off
            </span>
          )}
          <Pencil size={12} className="text-mute shrink-0" />
        </button>
      </div>

      {/* Remember-last toggle. When on, picking a library in any chat
          auto-updates the default above so new chats inherit the most
          recent choice. "None" selections don't move the default. */}
      <label className="flex items-start gap-2.5 cursor-pointer group">
        <input
          type="checkbox"
          checked={rememberLastLibrary}
          onChange={(e) => setRememberLastLibrary(e.target.checked)}
          className="accent-accent mt-0.5"
        />
        <div className="min-w-0">
          <div className="font-mono text-[12px] text-text group-hover:text-accent transition-colors">
            Remember last library selection
          </div>
          <div className="font-mono text-[10px] text-mute/80 leading-relaxed mt-0.5">
            Auto-update the default above whenever you pick a library in a
            chat. Clearing a chat to "None" doesn&apos;t change the default.
          </div>
        </div>
      </label>

      <LibraryPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        libraries={libraries}
        activeLibraryId={defaultLibraryId}
        allowNone
        title="Default library for new chats"
        noneLabel="None — new chats start with RAG off"
        onSelect={(id) => {
          setDefaultLibraryId(id);
          setPickerOpen(false);
        }}
        onNewLibrary={() => {
          // Closing the modal returns control to the user — they can
          // hop to the Knowledge page to create one and return here.
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

/** Memoized so the shiki highlight doesn't re-run on every slider drag. */
const ThemePreview = memo(function ThemePreview() {
  return (
    <div className="mt-2 px-3 py-1 border border-line bg-bg">
      <MessageBody content={THEME_PREVIEW_SAMPLE} />
    </div>
  );
});

export type SettingsTab =
  | 'templates'
  | 'providers'
  | 'params'
  | 'knowledge'
  | 'appearance'
  | 'about';

const TABS: [SettingsTab, string][] = [
  ['templates', 'Prompt templates'],
  ['providers', 'Providers'],
  ['params', 'Chat defaults'],
  ['knowledge', 'Knowledge'],
  ['appearance', 'Appearance'],
  ['about', 'About'],
];

function WebLLMRow() {
  return (
    <div className="border border-line bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Dot tone="ok" />
        <ProviderLogo providerId="webllm" size={15} />
        <span className="text-[13px] text-text shrink-0">WebLLM</span>
        <Badge tone="neutral" mono>
          built-in
        </Badge>
        <span className="font-mono text-[10px] text-ok">ready</span>
        <div className="flex-1" />
        <span className="font-mono text-[11px] px-2.5 py-1 border border-accent/60 text-accent bg-accent/5">
          enabled
        </span>
      </div>
      <div className="font-mono text-[10px] text-mute mt-1">
        In-browser inference. Runs on this device's GPU via WebGPU.
      </div>
    </div>
  );
}

export function SettingsModal({
  open,
  onClose,
  templates,
  setTemplates,
  globalDefaults,
  setGlobalDefaults,
  defaultSystemPrompt,
  setDefaultSystemPrompt,
  codeTheme,
  setCodeTheme,
  titleMode,
  setTitleMode,
  accentColor,
  setAccentColor,
  defaultLibraryId,
  setDefaultLibraryId,
  rememberLastLibrary,
  setRememberLastLibrary,
  compressionMode,
  setCompressionMode,
  rememberPerSessionModel,
  setRememberPerSessionModel,
  tab,
  onTabChange,
}: {
  open: boolean;
  onClose: () => void;
  templates: PromptTemplate[];
  setTemplates: Dispatch<SetStateAction<PromptTemplate[]>>;
  globalDefaults: ModelParams;
  setGlobalDefaults: (patch: Partial<ModelParams>) => void;
  defaultSystemPrompt: string;
  setDefaultSystemPrompt: (value: string) => void;
  codeTheme: string;
  setCodeTheme: (value: string) => void;
  titleMode: TitleMode;
  setTitleMode: (value: TitleMode) => void;
  accentColor: AccentColor;
  setAccentColor: (value: AccentColor) => void;
  /** Library id new chats inherit as their RAG binding. null = no default. */
  defaultLibraryId: string | null;
  setDefaultLibraryId: (id: string | null) => void;
  /** When on, the per-chat library picker also updates defaultLibraryId. */
  rememberLastLibrary: boolean;
  setRememberLastLibrary: (value: boolean) => void;
  /** D10b — compression mode (auto-summarize / drop / off). */
  compressionMode: CompressionMode;
  setCompressionMode: (value: CompressionMode) => void;
  /** On: each chat keeps its own model. Off: one global model for all. */
  rememberPerSessionModel: boolean;
  setRememberPerSessionModel: (value: boolean) => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
  const [draft, setDraft] = useState({ title: '', content: '', description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', content: '', description: '' });
  const [resetArmed, setResetArmed] = useState(false);
  const [resetText, setResetText] = useState('');

  const addTemplate = async () => {
    if (!draft.title.trim()) return;
    const t = await createTemplate({
      title: draft.title.trim(),
      content: draft.content,
      description: draft.description.trim() || undefined,
      isBuiltIn: false,
    });
    setTemplates((prev) => [...prev, t]);
    setDraft({ title: '', content: '', description: '' });
  };

  const removeTemplate = async (id: string) => {
    await deleteTemplate(id);
    setTemplates((prev) => prev.filter((x) => x.id !== id));
  };

  const startEdit = (t: PromptTemplate) => {
    setEditingId(t.id);
    setEditDraft({
      title: t.title,
      content: t.content,
      description: t.description ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({ title: '', content: '', description: '' });
  };

  const saveEdit = async (id: string) => {
    const title = editDraft.title.trim();
    if (!title) return;
    const description = editDraft.description.trim() || undefined;
    await updateTemplate(id, { title, content: editDraft.content, description });
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, title, content: editDraft.content, description }
          : t,
      ),
    );
    cancelEdit();
  };

  const doReset = async () => {
    await resetEverything();
    // resetEverything() clears the first-run flag, so '/' shows the landing.
    window.location.href = '/';
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" width="max-w-3xl" stableHeight>
      <div className="flex border-b border-line">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
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
                {editingId === t.id ? (
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input
                      value={editDraft.title}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, title: e.target.value }))
                      }
                      placeholder="Title (used as /trigger)"
                      className="w-full bg-bg border border-accent/50 focus:outline-none px-2 py-1 text-[12px] font-mono"
                    />
                    <input
                      value={editDraft.description}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, description: e.target.value }))
                      }
                      placeholder="Description (optional) — shown in the / menu"
                      className="w-full bg-bg border border-line focus:border-accent/60 focus:outline-none px-2 py-1 text-[12px]"
                    />
                    <textarea
                      value={editDraft.content}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, content: e.target.value }))
                      }
                      rows={3}
                      className="w-full bg-bg border border-line focus:border-accent/60 focus:outline-none px-2 py-1.5 text-[12px] resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveEdit(t.id)}
                        disabled={!editDraft.title.trim()}
                        className="font-mono text-[10px] px-2 py-1 border border-accent/60 text-accent hover:bg-accent/10 disabled:opacity-30"
                      >
                        save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="font-mono text-[10px] px-2 py-1 border border-line text-mute hover:text-text"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[12px] text-text">/{t.title}</div>
                      <div className="font-mono text-[10px] text-mute truncate">
                        {t.description?.trim() || t.content.replace(/\n/g, ' ').trim()}
                      </div>
                    </div>
                    {t.isBuiltIn ? (
                      <span className="font-mono text-[9px] text-mute shrink-0">built-in</span>
                    ) : (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => startEdit(t)}
                          className="font-mono text-[11px] text-mute hover:text-text"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => removeTemplate(t.id)}
                          className="font-mono text-[11px] text-mute hover:text-err"
                        >
                          delete
                        </button>
                      </div>
                    )}
                  </>
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
            <input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Description (optional) — shown in the / menu"
              className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-1.5 text-[12px]"
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
            Each provider exposes models from a different runtime. WebLLM runs in this
            browser; localhost daemons and BYOK endpoints run elsewhere. Keys and URLs
            are stored in IndexedDB on this device — nothing leaves until you send a
            request.
          </p>
          <div>
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
              in-browser
            </div>
            <WebLLMRow />
          </div>
          <div>
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
              localhost daemons
            </div>
            <div className="space-y-1.5">
              {getHttpProviders()
                .filter((p) => !p.spec.usesKey)
                .map((p) => (
                  <ProviderConfig key={p.id} provider={p} />
                ))}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
              bring your own key (byok)
            </div>
            <div className="space-y-1.5">
              {getHttpProviders()
                .filter((p) => p.spec.usesKey)
                .map((p) => (
                  <ProviderConfig key={p.id} provider={p} />
                ))}
            </div>
          </div>
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
              thread naming
            </div>
            <div className="flex gap-1.5">
              {(
                [
                  ['trim', 'Trim first message'],
                  ['generate', 'Generate with model'],
                ] as [TitleMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setTitleMode(mode)}
                  className={`flex-1 font-mono text-[11px] px-3 py-1.5 border transition-colors ${
                    titleMode === mode
                      ? 'border-accent/60 text-accent bg-accent/10'
                      : 'border-line text-mute hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="font-mono text-[10px] text-mute mt-2">
              How new threads are named. “Generate with model” asks the model for a
              concise title, falling back to the trimmed message if it times out.
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
              model
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={rememberPerSessionModel}
                onChange={(e) => setRememberPerSessionModel(e.target.checked)}
                className="accent-accent mt-0.5"
              />
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-text group-hover:text-accent transition-colors">
                  Remember per-session model
                </div>
                <div className="font-mono text-[10px] text-mute/80 leading-relaxed mt-0.5">
                  On: each chat keeps the model you last used in it. Off (default):
                  one global model — picking a model anywhere applies to every chat.
                  (A cached local model still auto-loads on send; htllm never
                  downloads one without you picking it.)
                </div>
              </div>
            </label>
          </div>
          <div className="border-t border-line pt-4">
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
              compression
            </div>
            <div className="flex gap-1.5">
              {(
                [
                  ['auto', 'Auto-compact'],
                  ['drop', 'Drop oldest'],
                  ['off', 'Off'],
                ] as [CompressionMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setCompressionMode(mode)}
                  className={`flex-1 font-mono text-[11px] px-3 py-1.5 border transition-colors ${
                    compressionMode === mode
                      ? 'border-accent/60 text-accent bg-accent/10'
                      : 'border-line text-mute hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="font-mono text-[10px] text-mute mt-2 leading-relaxed">
              What happens as the conversation approaches the context window.{' '}
              <span className="text-accent/70">Auto-compact</span> summarizes older
              turns into a <code className="text-accent/70">&lt;summary&gt;</code> block
              (a chat-model call) and keeps recent turns verbatim — less context lost.{' '}
              <span className="text-accent/70">Drop oldest</span> silently trims older
              messages (cheaper, lossy). <span className="text-accent/70">Off</span>{' '}
              sends the full history untouched; the provider becomes the real limit and
              reports if it doesn&apos;t fit (zero hidden LLM activity). Auto-compact
              needs a context window of at least 4k tokens; falls back to dropping
              below that.
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

      {tab === 'knowledge' && <KnowledgeSettingsPanel
        defaultLibraryId={defaultLibraryId}
        setDefaultLibraryId={setDefaultLibraryId}
        rememberLastLibrary={rememberLastLibrary}
        setRememberLastLibrary={setRememberLastLibrary}
      />}

      {tab === 'appearance' && (
        <div className="p-4 space-y-6">
          <div>
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
              accent color
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(ACCENT_PRESETS) as [AccentColor, (typeof ACCENT_PRESETS)[AccentColor]][]).map(
                ([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => setAccentColor(key)}
                    className={`flex items-center gap-2 px-3 py-1.5 border transition-colors ${
                      accentColor === key
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-line hover:border-line-hi'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: `rgb(${preset.rgb})` }}
                    />
                    <span className="font-mono text-[10px] text-text">{preset.label}</span>
                  </button>
                ),
              )}
            </div>
            <div className="font-mono text-[10px] text-mute mt-2">
              UI accent color. Changes apply immediately.
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-1.5">
              code block theme
            </div>
            <select
              value={codeTheme}
              onChange={(e) => setCodeTheme(e.target.value)}
              className="w-full bg-surface border border-line focus:border-accent/60 focus:outline-none px-3 py-1.5 text-[12.5px] text-text font-mono"
            >
              {CODE_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <ThemePreview />
            <div className="font-mono text-[10px] text-mute mt-2">
              Syntax highlighting theme for code blocks in chat.
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
