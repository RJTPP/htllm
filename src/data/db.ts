import { openDB, type IDBPDatabase } from 'idb';

export interface HtllmDB {
  threads: {
    key: string;
    value: import('../providers/types').Thread;
  };
  messages: {
    key: string;
    value: import('../providers/types').Message;
    indexes: { byThread: string };
  };
  keys: {
    key: string;
    value: { providerId: string; value: string };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
  promptTemplates: {
    key: string;
    value: import('../providers/types').PromptTemplate;
  };
}

const DB_NAME = 'htllm';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<HtllmDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<HtllmDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HtllmDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('threads', { keyPath: 'id' });

        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
        messageStore.createIndex('byThread', 'threadId');

        db.createObjectStore('keys', { keyPath: 'providerId' });
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('promptTemplates', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}
