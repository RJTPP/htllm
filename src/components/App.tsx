import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ModelInfo, LoadProgress, EngineStatus, PromptTemplate } from '../providers/types';
import { WebLLMProvider } from '../providers/webllm/index';
import { useSystem } from '../hooks/useSystem';
import { useThreads } from '../hooks/useThreads';
import { useChat } from '../hooks/useChat';
import { useModelParams } from '../hooks/useModelParams';
import { seedBuiltInTemplates, listTemplates } from '../data/prompt-templates';
import { Sidebar } from './sidebar/Sidebar';
import { ChatPanel } from './chat/ChatPanel';
import { SystemRail } from './system/SystemRail';
import { ModelPicker } from './providers/ModelPicker';

const provider = new WebLLMProvider();

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
  } = useThreads();

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const { params, setGlobalDefaults } = useModelParams(activeThread);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({
    progress: 0,
    text: '',
    timeElapsed: 0,
  });
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);

  useEffect(() => {
    provider.listModels().then(setModels);
    seedBuiltInTemplates().then(() => listTemplates()).then(setTemplates);
  }, []);

  const handleAutoTitle = useCallback(
    async (threadId: string, firstMessage: string) => {
      const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '');
      await updateThreadTitle(threadId, title);
    },
    [updateThreadTitle],
  );

  const { messages, generating, send, stop } = useChat(
    provider,
    activeThreadId,
    params,
    updateThreadTimestamp,
    handleAutoTitle,
  );

  const modelReady = engineStatus === 'ready';

  // Once a model is ready, ensure there is an active thread to chat in.
  // The ref guards against double-creation from the async createThread window.
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
        await provider.loadModel(modelId, (report) => {
          setLoadProgress(report);
        });
        setLoadedModelId(modelId);
        setEngineStatus('ready');
        setModels((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, cached: true } : m)),
        );
        setPickerOpen(false);
      } catch (err) {
        setEngineStatus('error');
        setLoadProgress({
          progress: 0,
          text: err instanceof Error ? err.message : String(err),
          timeElapsed: 0,
        });
      }
    },
    [],
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
    await createThread(
      provider.id,
      loadedModelId ?? '',
    );
  }, [createThread, loadedModelId]);

  return (
    <div className="flex h-screen bg-bg text-text font-sans">
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        loadedModelId={loadedModelId}
        onOpenPicker={() => setPickerOpen(true)}
        onCreateThread={handleCreateThread}
        onSelectThread={selectThread}
        onDeleteThread={deleteThread}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2 border-b border-line flex items-center justify-between">
          <SystemRail system={system} />
        </div>

        <div className="flex-1 min-h-0">
          <ChatPanel
            messages={messages}
            generating={generating}
            modelReady={modelReady}
            visionSupported={provider.capabilities.vision}
            loadedModelId={loadedModelId}
            templates={templates}
            onSend={send}
            onStop={stop}
          />
        </div>
      </div>

      <ModelPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        models={models}
        loadedModelId={loadedModelId}
        system={system}
        params={params}
        engineStatus={engineStatus}
        loadProgress={loadProgress}
        onLoad={handleLoad}
        onUnload={handleUnload}
        onEvict={handleEvict}
        onParamsChange={setGlobalDefaults}
      />
    </div>
  );
}
