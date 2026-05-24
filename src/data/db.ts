import { openDB, type IDBPDatabase } from 'idb';

export interface HtllmDB {
  threads: {
    key: string;
    value: import('../providers/types').Thread;
    indexes: { byUpdatedAt: number };
  };
  messages: {
    key: string;
    value: import('../providers/types').Message;
    indexes: { byThread: string; byThreadCreated: [string, number] };
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
  folders: {
    key: string;
    value: import('../providers/types').Folder;
  };
  documents: {
    key: string;
    value: import('../providers/types').Document;
    indexes: { byCreatedAt: number };
  };
  chunks: {
    key: string;
    value: import('../providers/types').Chunk;
    indexes: { byDocument: string };
  };
  embeddings: {
    // Composite key: [chunkId, embeddingModelId]. Vectors from different
    // models occupy distinct vector spaces and aren't comparable, so we
    // keep them as separate records — switching models doesn't lose work.
    key: [string, string];
    value: import('../providers/types').EmbeddingRecord;
    indexes: { byModel: string; byChunk: string };
  };
}

const DB_NAME = 'htllm';
const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase<HtllmDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<HtllmDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HtllmDB>(DB_NAME, DB_VERSION, {
      // Version-aware migration: each block runs for databases below that
      // version, so both fresh installs and v1 upgrades reach the same shape.
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('threads', { keyPath: 'id' });

          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('byThread', 'threadId');

          db.createObjectStore('keys', { keyPath: 'providerId' });
          db.createObjectStore('settings', { keyPath: 'key' });
          db.createObjectStore('promptTemplates', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          const threadStore = tx.objectStore('threads');
          threadStore.createIndex('byUpdatedAt', 'updatedAt');
          const messageStore = tx.objectStore('messages');
          messageStore.createIndex('byThreadCreated', ['threadId', 'createdAt']);
        }
        if (oldVersion < 4) {
          // Phase 3 — RAG knowledge base stores.
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('byCreatedAt', 'createdAt');

          const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
          chunkStore.createIndex('byDocument', 'documentId');

          // (v4 created embeddings with keyPath='chunkId'; v5 rebuilds it
          //  with a composite key for multi-model support — see below.)
          const embedStore = db.createObjectStore('embeddings', { keyPath: 'chunkId' });
          embedStore.createIndex('byModel', 'embeddingModelId');
        }
        if (oldVersion < 5) {
          // Multi-model embedding support. The v4 store keyed by chunkId
          // alone could only hold one vector per chunk, so switching the
          // embedding model overwrote prior vectors. Rebuild with a
          // composite key [chunkId, embeddingModelId] so vectors from
          // different models coexist.
          //
          // Any v4 embeddings are dropped — they can be regenerated from
          // chunks via the Knowledge page. Chunks themselves survive
          // intact.
          if (db.objectStoreNames.contains('embeddings')) {
            db.deleteObjectStore('embeddings');
          }
          const embedStore = db.createObjectStore('embeddings', {
            keyPath: ['chunkId', 'embeddingModelId'],
          });
          embedStore.createIndex('byModel', 'embeddingModelId');
          embedStore.createIndex('byChunk', 'chunkId');
        }
      },
    });
  }
  return dbPromise;
}
