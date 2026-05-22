import { useState, useEffect, useCallback } from 'react';
import type { Thread } from '../providers/types';
import {
  createThread,
  listThreads,
  deleteThread as deleteThreadFromDb,
  updateThread as updateThreadInDb,
} from '../data/threads';
import { deleteMessagesForThread } from '../data/messages';

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadsLoaded, setThreadsLoaded] = useState(false);

  useEffect(() => {
    listThreads().then((t) => {
      setThreads(t);
      if (t.length > 0 && !activeThreadId) {
        setActiveThreadId(t[0]!.id);
      }
      setThreadsLoaded(true);
    });
  }, []);

  const create = useCallback(
    async (providerId: string, modelId: string, folderId?: string) => {
      const now = Date.now();
      const thread = await createThread({
        title: '',
        providerId,
        modelId,
        folderId,
        createdAt: now,
        updatedAt: now,
      });
      setThreads((prev) => [thread, ...prev]);
      setActiveThreadId(thread.id);
      return thread;
    },
    [],
  );

  const select = useCallback((id: string) => {
    setActiveThreadId(id);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await deleteMessagesForThread(id);
      await deleteThreadFromDb(id);
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeThreadId === id) {
        const remaining = threads.filter((t) => t.id !== id);
        setActiveThreadId(remaining[0]?.id ?? null);
      }
    },
    [activeThreadId, threads],
  );

  const updateTitle = useCallback(
    async (id: string, title: string) => {
      await updateThreadInDb(id, { title });
      setThreads((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title } : t)),
      );
    },
    [],
  );

  const updateTimestamp = useCallback(async (id: string) => {
    const updatedAt = Date.now();
    await updateThreadInDb(id, { updatedAt });
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, updatedAt } : t)),
    );
  }, []);

  const patch = useCallback(async (id: string, changes: Partial<Thread>) => {
    await updateThreadInDb(id, changes);
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    );
  }, []);

  return {
    threads,
    activeThreadId,
    threadsLoaded,
    createThread: create,
    selectThread: select,
    deleteThread: remove,
    updateThreadTitle: updateTitle,
    updateThreadTimestamp: updateTimestamp,
    updateThread: patch,
  };
}
