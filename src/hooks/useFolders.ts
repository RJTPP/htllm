import { useState, useEffect, useCallback } from 'react';
import type { Folder } from '../providers/types';
import {
  createFolder,
  listFolders,
  renameFolder as renameFolderInDb,
  deleteFolder as deleteFolderFromDb,
} from '../data/folders';

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    listFolders().then(setFolders);
  }, []);

  const create = useCallback(async (name: string) => {
    const folder = await createFolder(name);
    setFolders((prev) => [...prev, folder]);
    return folder;
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    await renameFolderInDb(id, name);
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteFolderFromDb(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return {
    folders,
    createFolder: create,
    renameFolder: rename,
    deleteFolder: remove,
  };
}
