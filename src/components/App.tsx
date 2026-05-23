import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  ModelInfo,
  LoadProgress,
  EngineStatus,
  PromptTemplate,
  ModelParams,
  ChatProvider,
  ReasoningEffort,
} from '../providers/types';
import { getProvider, getWebLLMProvider, getHttpProviders } from '../providers/registry';
import { useSystem } from '../hooks/useSystem';
import { useThreads } from '../hooks/useThreads';
import { useFolders } from '../hooks/useFolders';
import { useChat } from '../hooks/useChat';
import { useModelParams } from '../hooks/useModelParams';
import { seedBuiltInTemplates, listTemplates } from '../data/prompt-templates';
import {
  getSetting,
  setSetting,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_CODE_THEME,
  DEFAULT_TITLE_MODE,
  DEFAULT_ACCENT_COLOR,
  ACCENT_PRESETS,
  type TitleMode,
  type AccentColor,
} from '../data/settings';
import { setCodeTheme } from '../lib/highlight';
import { generateTitle } from '../lib/title';
import { detectReasoning, defaultEffort } from '../lib/reasoning';
import { NavRail, type NavPage } from './nav/NavRail';
import { SystemStats } from './system/SystemStats';
import { ModelSlot } from './system/ModelSlot';
import { WebGPUBlock } from './system/WebGPUBlock';
import { Sidebar } from './sidebar/Sidebar';
import { ChatPage } from './chat/ChatPage';
import { KnowledgeStub } from './knowledge/KnowledgeStub';
import { StorageManager } from './storage/StorageManager';
import { ModelPicker } from './providers/ModelPicker';
import { SettingsModal, type SettingsTab } from './settings/SettingsModal';
import { ThreadParams } from './providers/ThreadParams';
import { CommandPalette, type Command } from './command/CommandPalette';
import { searchMessages } from '../data/messages';

const webllmProvider = getWebLLMProvider();

type ModalId = 'picker' | 'settings' | 'params' | 'palette' | null;

export default function App() {
  const system = useSystem();
  const {
    threads,
    activeThreadId,
    threadsLoaded,
    createThread,
    selectThread,
    deleteThread,
    updateThreadTitle,
    updateThreadTimestamp,
    updateThread,
  } = useThreads();
  const { folders, createFolder, renameFolder, deleteFolder } = useFolders();

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const { params: rawParams, globalDefaults, setGlobalDefaults } = useModelParams(activeThread);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({
    progress: 0,
    text: '',
    timeElapsed: 0,
  });
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [lastModelId, setLastModelId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [page, setPage] = useState<NavPage>('chat');
  const [modal, setModal] = useState<ModalId>(null);
  const [defaultSystemPrompt, setDefaultSystemPromptState] = useState(DEFAULT_SYSTEM_PROMPT);
  const [codeTheme, setCodeThemeState] = useState(DEFAULT_CODE_THEME);
  const [titleMode, setTitleModeState] = useState<TitleMode>(DEFAULT_TITLE_MODE);
  const [accentColor, setAccentColorState] = useState<AccentColor>(DEFAULT_ACCENT_COLOR);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('templates');

  useEffect(() => {
    webllmProvider.listModels().then(setModels);
    getHttpProviders().forEach((p) => p.loadConfig());
    seedBuiltInTemplates()
      .then(() => listTemplates())
      .then(setTemplates);
    getSetting<string>('defaultSystemPrompt').then((v) => {
      if (v != null) setDefaultSystemPromptState(v);
    });
    getSetting<string>('lastModelId').then((v) => {
      if (v != null) setLastModelId(v);
    });
    getSetting<string>('codeTheme').then((v) => {
      if (v != null) {
        setCodeThemeState(v);
        setCodeTheme(v);
      }
    });
    getSetting<string>('titleMode').then((v) => {
      if (v === 'trim' || v === 'generate') setTitleModeState(v);
    });
    getSetting<AccentColor>('accentColor').then((v) => {
      if (v != null && ACCENT_PRESETS[v]) {
        setAccentColorState(v);
        document.documentElement.style.setProperty('--accent', ACCENT_PRESETS[v].rgb);
      }
    });
  }, []);

  const setDefaultSystemPrompt = useCallback(async (value: string) => {
    setDefaultSystemPromptState(value);
    await setSetting('defaultSystemPrompt', value);
  }, []);

  const handleSetCodeTheme = useCallback(async (value: string) => {
    setCodeThemeState(value);
    setCodeTheme(value);
    await setSetting('codeTheme', value);
  }, []);

  const setTitleMode = useCallback(async (value: TitleMode) => {
    setTitleModeState(value);
    await setSetting('titleMode', value);
  }, []);

  const handleSetAccentColor = useCallback(async (value: AccentColor) => {
    setAccentColorState(value);
    document.documentElement.style.setProperty('--accent', ACCENT_PRESETS[value].rgb);
    await setSetting('accentColor', value);
  }, []);

  const systemPrompt = activeThread?.systemPrompt ?? defaultSystemPrompt;

  // A thread is bound to a provider via thread.providerId. WebLLM needs a model
  // loaded into its engine; an HTTP provider is ready as soon as it has a
  // modelId — so the lifecycle branch is a provider capability, not an id check.
  const activeProvider: ChatProvider =
    getProvider(activeThread?.providerId ?? '') ?? webllmProvider;
  const activeProviderId = activeProvider.id;
  const isApiThread = !activeProvider.needsModelLoad;
  const activeModelId = isApiThread ? (activeThread?.modelId ?? '') : (loadedModelId ?? '');

  // New threads get a title from the first message: a trimmed slice always
  // (instant), then optionally upgraded to a model-generated title. If
  // generation times out or fails, the trimmed title stays.
  const handleAutoTitle = useCallback(
    async (threadId: string, firstMessage: string) => {
      const trimmed =
        firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '');
      await updateThreadTitle(threadId, trimmed);
      if (titleMode === 'generate') {
        const generated = await generateTitle(
          activeProvider,
          activeModelId,
          firstMessage,
        );
        if (generated) await updateThreadTitle(threadId, generated);
      }
    },
    [titleMode, activeProvider, activeModelId, updateThreadTitle],
  );

  const activeReasoningCapability = useMemo(
    () => (activeModelId ? detectReasoning(activeModelId) : undefined),
    [activeModelId],
  );

  // When a thread hasn't been customized, the reasoning effort default
  // depends on model capability: 'low' for effort models, 'off' for toggle
  // models. Customized threads keep their explicit stored value.
  const params = useMemo<ModelParams>(() => {
    if (activeThread?.modelParams) return rawParams;
    return { ...rawParams, reasoningEffort: defaultEffort(activeReasoningCapability) };
  }, [rawParams, activeThread?.modelParams, activeReasoningCapability]);

  const { messages, generating, send, regenerate, editAndResend, stop } = useChat(
    activeProvider,
    activeModelId,
    activeThreadId,
    params,
    systemPrompt,
    updateThreadTimestamp,
    handleAutoTitle,
  );

  const modelReady = isApiThread
    ? !!activeThread?.modelId
    : engineStatus === 'ready';

  // Vision capability: API providers support image_url parts natively, so use
  // the provider capability. WebLLM models vary — look up the loaded model.
  const visionOk = isApiThread
    ? activeProvider.capabilities.vision
    : !!models.find((m) => m.id === activeModelId)?.vision;

  // Ensure there is always an active thread to type into — created on first
  // run (and after the last thread is deleted), independent of model state.
  const pendingRef = useRef<{ text: string; images?: import('../lib/image').ChatImage[] } | null>(null);
  const autoThreadRef = useRef(false);
  useEffect(() => {
    if (threadsLoaded && activeThreadId === null && !autoThreadRef.current) {
      autoThreadRef.current = true;
      createThread(webllmProvider.id, loadedModelId ?? '').finally(() => {
        autoThreadRef.current = false;
      });
    }
  }, [threadsLoaded, activeThreadId, loadedModelId, createThread]);

  useEffect(() => {
    if (!modelReady || !pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    send(pending.text, pending.images);
  }, [modelReady, send]);

  const handleLoad = useCallback(
    async (modelId: string) => {
      setEngineStatus('loading');
      setLoadProgress({ progress: 0, text: 'Initializing engine…', timeElapsed: 0 });
      try {
        await webllmProvider.loadModel(
          modelId,
          (report) => setLoadProgress(report),
          globalDefaults.contextWindow,
        );
        setLoadedModelId(modelId);
        setEngineStatus('ready');
        setModels((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, cached: true } : m)),
        );
        setModal(null);
        setLastModelId(modelId);
        await setSetting('lastModelId', modelId);
        // Loading a WebLLM model binds the active thread to WebLLM — handles the
        // case where the thread was previously pointed at an API provider.
        if (activeThreadId) {
          updateThread(activeThreadId, { providerId: webllmProvider.id, modelId });
        }
      } catch (err) {
        setEngineStatus('error');
        setLoadProgress({
          progress: 0,
          text: err instanceof Error ? err.message : String(err),
          timeElapsed: 0,
        });
      }
    },
    [globalDefaults.contextWindow, activeThreadId, updateThread],
  );

  const handleUnload = useCallback(async () => {
    await webllmProvider.unload();
    setLoadedModelId(null);
    setEngineStatus('idle');
    setLoadProgress({ progress: 0, text: '', timeElapsed: 0 });
  }, []);

  const handleEvict = useCallback(
    async (modelId: string) => {
      if (modelId === loadedModelId) {
        await handleUnload();
      }
      await webllmProvider.evictModel(modelId);
      setModels((prev) =>
        prev.map((m) => (m.id === modelId ? { ...m, cached: false } : m)),
      );
    },
    [loadedModelId, handleUnload],
  );

  const handleCreateThread = useCallback(async () => {
    // Thread switching is locked during generation so the stream can't
    // bleed into another thread.
    if (generating) return;
    if (activeThreadId && messages.length === 0) {
      setPage('chat');
      return;
    }
    // Carry the current provider + model into the new thread so "new chat"
    // continues with whatever the user was just using — and keep it in the
    // same folder as the current thread.
    await createThread(activeProviderId, activeModelId, activeThread?.folderId);
    setPage('chat');
  }, [
    createThread,
    activeProviderId,
    activeModelId,
    activeThread,
    activeThreadId,
    messages.length,
    generating,
  ]);

  // Global shortcuts: Cmd/Ctrl+K opens the command palette, Cmd/Ctrl+Shift+O
  // starts a new chat.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyK') {
        e.preventDefault();
        setModal((m) => (m === 'palette' ? null : 'palette'));
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyO') {
        e.preventDefault();
        handleCreateThread();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCreateThread]);

  const commands: Command[] = useMemo(() => {
    // Only build the full command list when the palette is open.
    if (modal !== 'palette') return [];
    const cmds: Command[] = [];
    // New chat is omitted mid-generation — thread switching is locked.
    if (!generating) {
      cmds.push({
        id: 'new-chat',
        label: 'New chat',
        group: 'Actions',
        hint: '⇧⌘O',
        run: () => void handleCreateThread(),
      });
    }
    cmds.push(
      {
        id: 'change-model',
        label: 'Change model',
        group: 'Actions',
        run: () => setModal('picker'),
      },
      {
        id: 'thread-params',
        label: 'Thread parameters',
        group: 'Actions',
        run: () => setModal('params'),
      },
      {
        id: 'settings',
        label: 'Open settings',
        group: 'Actions',
        run: () => setModal('settings'),
      },
      {
        id: 'nav-chat',
        label: 'Go to Chat',
        group: 'Navigation',
        run: () => setPage('chat'),
      },
      {
        id: 'nav-knowledge',
        label: 'Go to Knowledge',
        group: 'Navigation',
        run: () => setPage('knowledge'),
      },
      {
        id: 'nav-storage',
        label: 'Go to Storage',
        group: 'Navigation',
        run: () => setPage('storage'),
      },
    );
    // Deleting the current thread and switching threads both move
    // activeThreadId — omitted while a generation is in progress.
    if (!generating) {
      if (activeThreadId) {
        cmds.push({
          id: 'delete-thread',
          label: 'Delete current thread',
          group: 'Actions',
          run: () => void deleteThread(activeThreadId),
        });
      }
      for (const t of threads) {
        if (t.id === activeThreadId) continue;
        cmds.push({
          id: `thread-${t.id}`,
          label: t.title || 'Untitled thread',
          group: 'Switch to thread',
          run: () => {
            selectThread(t.id);
            setPage('chat');
          },
        });
      }
    }
    return cmds;
  }, [
    modal,
    handleCreateThread,
    activeThreadId,
    deleteThread,
    threads,
    selectThread,
    generating,
  ]);

  // Full-text message search for the command palette — resolves matches into
  // commands that jump to the containing thread.
  const searchMessagesAsync = useCallback(
    async (query: string): Promise<Command[]> => {
      const hits = await searchMessages(query, 25);
      return hits.map((hit) => {
        const thread = threads.find((t) => t.id === hit.threadId);
        return {
          id: `msg-${hit.messageId}`,
          label: hit.snippet,
          sublabel: `${hit.role} · ${thread?.title || 'Untitled thread'}`,
          group: 'Messages',
          run: () => {
            selectThread(hit.threadId);
            setPage('chat');
          },
        };
      });
    },
    [threads, selectThread],
  );

  const handleSend = useCallback(
    (text: string, images?: import('../lib/image').ChatImage[]) => {
      if (modelReady) {
        send(text, images);
        return;
      }
      // Deferred auto-load only applies to WebLLM; API threads have no load step.
      if (!isApiThread && lastModelId && engineStatus === 'idle') {
        const cached = models.find((m) => m.id === lastModelId)?.cached;
        if (cached) {
          pendingRef.current = { text, images };
          handleLoad(lastModelId);
          return;
        }
      }
      setModal('picker');
    },
    [modelReady, isApiThread, lastModelId, engineStatus, models, send, handleLoad],
  );

  // Selecting a model from an HTTP provider binds the active thread to that
  // provider — no download step, so the thread is immediately ready to chat.
  const handleSelectApiModel = useCallback(
    (providerId: string, modelId: string) => {
      if (activeThreadId) {
        updateThread(activeThreadId, { providerId, modelId });
      }
      setModal(null);
    },
    [activeThreadId, updateThread],
  );

  // Jump from an unconfigured provider in the model picker straight to its
  // settings — closes the picker and opens Settings on the Providers tab.
  const handleConfigureProvider = useCallback(() => {
    setSettingsTab('providers');
    setModal('settings');
  }, []);

  const handleChangeSystemPrompt = useCallback(
    (value: string) => {
      if (activeThreadId) updateThread(activeThreadId, { systemPrompt: value });
    },
    [activeThreadId, updateThread],
  );

  const handleThreadParamsApply = useCallback(
    (next: ModelParams) => {
      if (activeThreadId) updateThread(activeThreadId, { modelParams: next });
    },
    [activeThreadId, updateThread],
  );

  const handleThreadParamsReset = useCallback(() => {
    if (activeThreadId) updateThread(activeThreadId, { modelParams: undefined });
  }, [activeThreadId, updateThread]);

  const openPicker = useCallback(() => setModal('picker'), []);
  const openParams = useCallback(() => setModal('params'), []);

  const handleReasoningChange = useCallback(
    (effort: ReasoningEffort) => {
      if (activeThreadId) {
        updateThread(activeThreadId, {
          modelParams: { ...params, reasoningEffort: effort },
        });
      }
    },
    [activeThreadId, params, updateThread],
  );

  const handleMoveThread = useCallback(
    (threadId: string, folderId: string | null) => {
      updateThread(threadId, { folderId: folderId ?? undefined });
    },
    [updateThread],
  );

  // Deleting a folder un-assigns its threads (they become ungrouped) rather
  // than deleting them, then removes the folder itself.
  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      const inFolder = threads.filter((t) => t.folderId === folderId);
      for (const t of inFolder) {
        await updateThread(t.id, { folderId: undefined });
      }
      await deleteFolder(folderId);
    },
    [threads, updateThread, deleteFolder],
  );

  return (
    <div className="h-screen flex overflow-hidden bg-bg text-text font-sans">
      <NavRail page={page} setPage={setPage} onOpenSettings={() => setModal('settings')} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="reveal reveal-1 border-b border-line bg-bg px-4 py-2 flex items-center gap-4">
          {system && <SystemStats system={system} compact />}
          <div className="ml-auto">
            <ModelSlot
              model={
                isApiThread
                  ? activeThread?.modelId || null
                  : loadedModelId ?? lastModelId
              }
              models={models}
              state={
                isApiThread
                  ? activeThread?.modelId
                    ? 'ready'
                    : 'idle'
                  : engineStatus
              }
              progress={loadProgress}
              onClick={() => setModal('picker')}
            />
          </div>
        </header>

        {system && !system.webgpu ? (
          <WebGPUBlock />
        ) : (
          <div className="flex-1 flex min-h-0">
            {page === 'chat' && (
              <>
                <Sidebar
                  threads={threads}
                  folders={folders}
                  activeId={activeThreadId}
                  onSelect={selectThread}
                  onNew={handleCreateThread}
                  onDelete={deleteThread}
                  onRename={updateThreadTitle}
                  onMoveThread={handleMoveThread}
                  onCreateFolder={createFolder}
                  onRenameFolder={renameFolder}
                  onDeleteFolder={handleDeleteFolder}
                  locked={generating}
                />
                <ChatPage
                  thread={activeThread}
                  messages={messages}
                  models={models}
                  loadedModelId={activeModelId || null}
                  modelReady={modelReady}
                  generating={generating}
                  templates={templates}
                  defaultSystemPrompt={defaultSystemPrompt}
                  params={params}
                  visionOk={visionOk}
                  reasoningCapability={activeReasoningCapability}
                  onReasoningChange={handleReasoningChange}
                  onSend={handleSend}
                  onStop={stop}
                  onRegenerate={regenerate}
                  onEditAndResend={editAndResend}
                  onOpenPicker={openPicker}
                  onParams={openParams}
                  onChangeSystemPrompt={handleChangeSystemPrompt}
                />
              </>
            )}
            {page === 'knowledge' && <KnowledgeStub />}
            {page === 'storage' && (
                  <StorageManager
                    models={models}
                    loadedModelId={loadedModelId}
                    onEvict={handleEvict}
                    onOpenSettings={() => {
                      setSettingsTab('about');
                      setModal('settings');
                    }}
                  />
                )}
          </div>
        )}
      </div>

      <ModelPicker
        open={modal === 'picker'}
        onClose={() => setModal(null)}
        models={models}
        loadedModelId={loadedModelId}
        system={system}
        globalDefaults={globalDefaults}
        engineStatus={engineStatus}
        loadProgress={loadProgress}
        onLoad={handleLoad}
        onUnload={handleUnload}
        onEvict={handleEvict}
        onParamsChange={setGlobalDefaults}
        defaultProviderId={activeProviderId}
        apiModelId={isApiThread ? activeThread?.modelId ?? null : null}
        onSelectApiModel={handleSelectApiModel}
        onConfigureProvider={handleConfigureProvider}
      />

      <SettingsModal
        open={modal === 'settings'}
        onClose={() => setModal(null)}
        templates={templates}
        setTemplates={setTemplates}
        globalDefaults={globalDefaults}
        setGlobalDefaults={setGlobalDefaults}
        defaultSystemPrompt={defaultSystemPrompt}
        setDefaultSystemPrompt={setDefaultSystemPrompt}
        codeTheme={codeTheme}
        setCodeTheme={handleSetCodeTheme}
        titleMode={titleMode}
        setTitleMode={setTitleMode}
        accentColor={accentColor}
        setAccentColor={handleSetAccentColor}
        tab={settingsTab}
        onTabChange={setSettingsTab}
      />

      <ThreadParams
        open={modal === 'params'}
        onClose={() => setModal(null)}
        params={params}
        defaults={globalDefaults}
        reasoningCapability={activeReasoningCapability}
        onApply={handleThreadParamsApply}
        onReset={handleThreadParamsReset}
      />

      <CommandPalette
        open={modal === 'palette'}
        onClose={() => setModal(null)}
        commands={commands}
        asyncCommands={searchMessagesAsync}
      />
    </div>
  );
}
