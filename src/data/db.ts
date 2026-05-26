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
  libraries: {
    key: string;
    value: import('../providers/types').Library;
    indexes: { byCreatedAt: number };
  };
  documents: {
    key: string;
    value: import('../providers/types').Document;
    indexes: { byCreatedAt: number; byLibrary: string };
  };
  chunks: {
    key: string;
    value: import('../providers/types').Chunk;
    indexes: { byDocument: string; byParent: string };
  };
  parents: {
    // Hierarchical chunking (D8): the larger context block returned to
    // the LLM after a child chunk hit. One parent spans several chunks.
    key: string;
    value: import('../providers/types').ParentChunk;
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
const DB_VERSION = 7;

/** Stable id for the auto-created "Default" library so migrations and
 *  fresh installs both reference the same record. */
export const DEFAULT_LIBRARY_ID = 'default';

let dbPromise: Promise<IDBPDatabase<HtllmDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<HtllmDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HtllmDB>(DB_NAME, DB_VERSION, {
      // Version-aware migration: each block runs for databases below that
      // version, so both fresh installs and v1 upgrades reach the same shape.
      // The callback is async so we can `await` IDB requests inside —
      // critical for cursor iteration and writes that must complete before
      // the upgrade transaction commits.
      async upgrade(db, oldVersion, _newVersion, tx) {
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
        if (oldVersion < 6) {
          // Libraries — named groups of documents pinned to one embedding
          // model. Every document now belongs to exactly one library.
          // A "Default" library is auto-created so the migration can
          // assign all existing docs to it without prompting the user.
          //
          // Defensive: if a prior partial run left the store in place but
          // mis-shaped, reuse it instead of crashing. The Default record
          // is upserted either way so the data layer never sees an empty
          // libraries store after migration.
          let libStore;
          if (db.objectStoreNames.contains('libraries')) {
            libStore = tx.objectStore('libraries');
          } else {
            libStore = db.createObjectStore('libraries', { keyPath: 'id' });
            libStore.createIndex('byCreatedAt', 'createdAt');
          }

          // Await the put so the upgrade transaction stays alive for it.
          await libStore.put({
            id: DEFAULT_LIBRARY_ID,
            name: 'Default',
            // Empty until the user picks one — first embed action commits it.
            embeddingModelId: '',
            createdAt: Date.now(),
          });

          // Backfill libraryId on every existing document.
          const docStore = tx.objectStore('documents');
          if (!docStore.indexNames.contains('byLibrary')) {
            docStore.createIndex('byLibrary', 'libraryId');
          }

          // Cursor iteration is async — by awaiting here (inside the
          // async upgrade callback) we keep the transaction open until
          // every update has been queued.
          let cursor = await docStore.openCursor();
          while (cursor) {
            const doc = cursor.value as import('../providers/types').Document;
            if (!doc.libraryId) {
              await cursor.update({ ...doc, libraryId: DEFAULT_LIBRARY_ID });
            }
            cursor = await cursor.continue();
          }
        }
        if (oldVersion < 7) {
          // D8 — hierarchical chunking. Adds a parents store and a
          // byParent index on chunks. Existing flat chunks (no parentId)
          // continue to work; retrieval falls back to the chunk's own
          // text when parentId is undefined. No backfill — only new
          // ingestion produces parents.
          if (!db.objectStoreNames.contains('parents')) {
            const parentStore = db.createObjectStore('parents', { keyPath: 'id' });
            parentStore.createIndex('byDocument', 'documentId');
          }
          const chunkStore = tx.objectStore('chunks');
          if (!chunkStore.indexNames.contains('byParent')) {
            chunkStore.createIndex('byParent', 'parentId');
          }
        }
      },
    });
  }
  return dbPromise;
}
