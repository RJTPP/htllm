// Installs a global `indexedDB` + `IDBKeyRange` backed by an in-memory
// fake, so the data layer (src/data/*) can run under Node. Each test file
// gets a fresh module registry from Vitest, but the IndexedDB instance is
// process-global — data-layer tests should use unique thread ids (or
// delete what they create) to stay isolated.
import 'fake-indexeddb/auto';
