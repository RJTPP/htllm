import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  ModelInfo,
  LoadProgress,
  EngineStatus,
  PromptTemplate,
  ModelParams,
} from '../providers/types';
import { WebLLMProvider } from '../providers/webllm/index';
import { useSystem } from '../hooks/useSystem';
import { useThreads } from '../hooks/useThreads';
import { useChat } from '../hooks/useChat';
import { useModelParams } from '../hooks/useModelParams';
import { seedBuiltInTemplates, listTemplates } from '../data/prompt-templates';
import { getSetting, setSetting, DEFAULT_SYSTEM_PROMPT } from '../data/settings';
import { NavRail, type NavPage } from './nav/NavRail';
import { SystemStats } from './system/SystemStats';
import { ModelSlot } from './system/ModelSlot';
import { WebGPUBlock } from './system/WebGPUBlock';
import { Sidebar } from './sidebar/Sidebar';
import { ChatPage } from './chat/ChatPage';
import { KnowledgeStub } from './knowledge/KnowledgeStub';
import { StorageStub } from './storage/StorageStub';
import { ModelPicker } from './providers/ModelPicker';
import { SettingsModal } from './settings/SettingsModal';
import { ThreadParams } from './providers/ThreadParams';

const provider = new WebLLMProvider();

type ModalId = 'picker' | 'settings' | 'params' | null;

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

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const { params, globalDefaults, setGlobalDefaults } = useModelParams(activeThread);

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

  useEffect(() => {
    provider.listModels().then(setModels);
    seedBuiltInTemplates()
      .then(() => listTemplates())
      .then(setTemplates);
    getSetting<string>('defaultSystemPrompt').then((v) => {
      if (v != null) setDefaultSystemPromptState(v);
    });
    getSetting<string>('lastModelId').then((v) => {
      if (v != null) setLastModelId(v);
    });
  }, []);

  const setDefaultSystemPrompt = useCallback(async (value: string) => {
    setDefaultSystemPromptState(value);
    await setSetting('defaultSystemPrompt', value);
  }, []);

  const handleAutoTitle = useCallback(
    async (threadId: string, firstMessage: string) => {
      const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '');
      await updateThreadTitle(threadId, title);
    },
    [updateThreadTitle],
  );

  const systemPrompt = activeThread?.systemPrompt ?? defaultSystemPrompt;

  const { messages, generating, send, regenerate, stop } = useChat(
    provider,
    activeThreadId,
    params,
    systemPrompt,
    updateThreadTimestamp,
    handleAutoTitle,
  );

  const modelReady = engineStatus === 'ready';

  // Ensure there is always an active thread to type into — created on first
  // run (and after the last thread is deleted), independent of model state.
  const pendingRef = useRef<{ text: string; images?: import('../lib/image').ChatImage[] } | null>(null);
  const autoThreadRef = useRef(false);
  useEffect(() => {
    if (threadsLoaded && activeThreadId === null && !autoThreadRef.current) {
      autoThreadRef.current = true;
      createThread(provider.id, loadedModelId ?? '').finally(() => {
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
        await provider.loadModel(
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
      } catch (err) {
        setEngineStatus('error');
        setLoadProgress({
          progress: 0,
          text: err instanceof Error ? err.message : String(err),
          timeElapsed: 0,
        });
      }
    },
    [globalDefaults.contextWindow],
  );

  const handleUnload = useCallback(async () => {
    await provider.unload();
    setLoadedModelId(null);
    setEngineStatus('idle');
    setLoadProgress({ progress: 0, text: '', timeElapsed: 0 });
  }, []);

  const handleEvict = useCallback(
    async (modelId: string) => {
      if (modelId === loadedModelId) {
        await handleUnload();
      }
      await provider.evictModel(modelId);
      setModels((prev) =>
        prev.map((m) => (m.id === modelId ? { ...m, cached: false } : m)),
      );
    },
    [loadedModelId, handleUnload],
  );

  const handleCreateThread = useCallback(async () => {
    await createThread(provider.id, loadedModelId ?? '');
    setPage('chat');
  }, [createThread, loadedModelId]);

  // Cmd/Ctrl + Shift + O — new chat.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyO') {
        e.preventDefault();
        handleCreateThread();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCreateThread]);

  const handleSend = useCallback(
    (text: string, images?: import('../lib/image').ChatImage[]) => {
      if (modelReady) {
        send(text, images);
        return;
      }
      if (lastModelId && engineStatus === 'idle') {
        const cached = models.find((m) => m.id === lastModelId)?.cached;
        if (cached) {
          pendingRef.current = { text, images };
          handleLoad(lastModelId);
          return;
        }
      }
      setModal('picker');
    },
    [modelReady, lastModelId, engineStatus, models, send, handleLoad],
  );

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

  return (
    <div className="h-screen flex overflow-hidden bg-bg text-text font-sans">
      <NavRail page={page} setPage={setPage} onOpenSettings={() => setModal('settings')} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="reveal reveal-1 border-b border-line bg-bg px-4 py-2 flex items-center gap-4">
          {system && <SystemStats system={system} compact />}
          <div className="ml-auto">
            <ModelSlot
              model={loadedModelId ?? lastModelId}
              models={models}
              state={engineStatus}
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
                  activeId={activeThreadId}
                  onSelect={selectThread}
                  onNew={handleCreateThread}
                  onDelete={deleteThread}
                  onRename={updateThreadTitle}
                />
                <ChatPage
                  thread={activeThread}
                  messages={messages}
                  models={models}
                  loadedModelId={loadedModelId}
                  modelReady={modelReady}
                  generating={generating}
                  templates={templates}
                  defaultSystemPrompt={defaultSystemPrompt}
                  params={params}
                  onSend={handleSend}
                  onStop={stop}
                  onRegenerate={regenerate}
                  onOpenPicker={() => setModal('picker')}
                  onParams={() => setModal('params')}
                  onChangeSystemPrompt={handleChangeSystemPrompt}
                />
              </>
            )}
            {page === 'knowledge' && <KnowledgeStub />}
            {page === 'storage' && <StorageStub />}
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
      />

      <ThreadParams
        open={modal === 'params'}
        onClose={() => setModal(null)}
        params={params}
        defaults={globalDefaults}
        onApply={handleThreadParamsApply}
        onReset={handleThreadParamsReset}
      />
    </div>
  );
}
