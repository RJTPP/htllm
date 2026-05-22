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

  // Once a model is ready, ensure there is an active thread to chat in.
  const autoThreadRef = useRef(false);
  useEffect(() => {
    if (modelReady && activeThreadId === null && !autoThreadRef.current) {
      autoThreadRef.current = true;
      createThread(provider.id, loadedModelId ?? '').finally(() => {
        autoThreadRef.current = false;
      });
    }
  }, [modelReady, activeThreadId, loadedModelId, createThread]);

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

  const handleChangeSystemPrompt = useCallback(
    (value: string) => {
      if (activeThreadId) updateThread(activeThreadId, { systemPrompt: value });
    },
    [activeThreadId, updateThread],
  );

  const handleThreadParamsChange = useCallback(
    (patch: Partial<ModelParams>) => {
      if (activeThreadId) {
        updateThread(activeThreadId, { modelParams: { ...params, ...patch } });
      }
    },
    [activeThreadId, params, updateThread],
  );

  const handleThreadParamsReset = useCallback(() => {
    if (activeThreadId) updateThread(activeThreadId, { modelParams: undefined });
  }, [activeThreadId, updateThread]);

  return (
    <div className="h-screen flex overflow-hidden bg-bg text-text font-sans">
      <NavRail page={page} setPage={setPage} onOpenSettings={() => setModal('settings')} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="reveal reveal-1 border-b border-line bg-bg px-4 py-2 flex items-center justify-between gap-4">
          <ModelSlot
            model={loadedModelId}
            models={models}
            state={engineStatus}
            progress={loadProgress}
            onClick={() => setModal('picker')}
          />
          {system && <SystemStats system={system} compact />}
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
                  onSend={send}
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
        onChange={handleThreadParamsChange}
        onReset={handleThreadParamsReset}
      />
    </div>
  );
}
