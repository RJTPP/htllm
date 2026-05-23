import { useState, useEffect, useCallback } from 'react';
import type { ModelInfo } from '../../providers/types';
import { fmtBytes, shortenModelId } from '../../lib/format';
import {
  getStoreStats,
  getCacheEntries,
  deleteCache,
  clearStore,
  type StoreStats,
  type CacheEntry,
} from '../../data/storage-stats';
import { HardDrive, Database, Trash2, AlertTriangle, RefreshCw, Package } from 'lucide-react';

/** Friendly labels for IndexedDB store names. */
const STORE_LABELS: Record<string, string> = {
  threads: 'Threads',
  messages: 'Messages',
  keys: 'API Keys',
  settings: 'Settings',
  promptTemplates: 'Prompt Templates',
  folders: 'Folders',
};

/** Stores the user should never accidentally clear. */
const PROTECTED_STORES = new Set(['keys']);

function StorageBar({
  used,
  total,
}: {
  used: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const color = pct > 0.9 ? 'bg-err' : pct > 0.7 ? 'bg-yellow-500' : 'bg-accent';
  return (
    <div className="w-full h-2 bg-surface2 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  tone = 'danger',
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: 'danger' | 'neutral';
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  if (confirming) {
    return (
      <button
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
        className="flex items-center gap-1 font-mono text-[10px] px-2 py-1 border border-err/60 text-err hover:bg-err/10 transition-colors"
      >
        <AlertTriangle size={11} /> {confirmLabel}
      </button>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={`flex items-center gap-1 font-mono text-[10px] px-2 py-1 border transition-colors ${
        tone === 'danger'
          ? 'border-err/40 text-err/70 hover:text-err hover:border-err/60'
          : 'border-line text-mute hover:text-text'
      }`}
    >
      <Trash2 size={11} /> {label}
    </button>
  );
}

interface StorageEstimate {
  usage: number;
  quota: number;
}

export function StorageManager({
  models,
  loadedModelId,
  onEvict,
  onOpenSettings,
}: {
  models: ModelInfo[];
  loadedModelId: string | null;
  onEvict: (modelId: string) => void;
  onOpenSettings: () => void;
}) {
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [stores, caches] = await Promise.all([getStoreStats(), getCacheEntries()]);
    setStoreStats(stores);
    setCacheEntries(caches);
    try {
      const est = await navigator.storage.estimate();
      setStorageEstimate({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    } catch {
      // Storage API not available
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cachedModels = models.filter((m) => m.cached);
  const totalCacheBytes = cacheEntries.reduce((sum, e) => sum + e.sizeBytes, 0);
  const storageUsed = storageEstimate?.usage ?? 0;
  const storageQuota = storageEstimate?.quota ?? 0;

  const handleDeleteCache = async (cacheName: string) => {
    await deleteCache(cacheName);
    // Also update the model cached flag via evict if this looks like a model cache
    const matchingModel = cachedModels.find(
      (m) => cacheName.toLowerCase().includes(m.id.toLowerCase().slice(0, 20)),
    );
    if (matchingModel) {
      onEvict(matchingModel.id);
    }
    await refresh();
  };

  const handleClearStore = async (storeName: string) => {
    await clearStore(storeName as Parameters<typeof clearStore>[0]);
    await refresh();
  };

  return (
    <div className="flex-1 grid-bg overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-lg font-medium tracking-tight">Storage</h1>
            <p className="text-[12px] text-mute mt-1">
              Manage model weights, chat data, and browser storage.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 font-mono text-[10px] px-2.5 py-1.5 border border-line text-mute hover:text-text disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> refresh
          </button>
        </div>

        {/* Overall usage bar */}
        {storageEstimate && (
          <div className="border border-line bg-surface/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive size={14} className="text-accent" />
              <span className="font-mono text-[11px] text-text/80">Browser Storage</span>
            </div>
            <StorageBar used={storageUsed} total={storageQuota} />
            <div className="flex justify-between font-mono text-[10px] text-mute">
              <span>{fmtBytes(storageUsed)} used</span>
              <span>{fmtBytes(storageQuota)} quota</span>
            </div>
          </div>
        )}

        {/* Model weight caches */}
        <div className="border border-line bg-surface/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Package size={14} className="text-accent" />
            <span className="font-mono text-[11px] text-text/80">Model Weights</span>
            <span className="ml-auto font-mono text-[10px] text-mute">
              {cachedModels.length} cached · {fmtBytes(totalCacheBytes)}
            </span>
          </div>

          {cachedModels.length === 0 ? (
            <p className="text-[11px] text-mute py-2">
              No models cached. Download a model from the model picker to get started.
            </p>
          ) : (
            <div className="space-y-1">
              {cachedModels.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-1.5 px-2 border border-line/40 bg-bg/40"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] text-text truncate">
                      {shortenModelId(m.id)}
                    </div>
                    <div className="font-mono text-[10px] text-mute">
                      {m.quantization} · {m.vramRequiredMB > 0 ? `~${m.vramRequiredMB} MB VRAM` : ''}
                      {m.id === loadedModelId && (
                        <span className="ml-2 text-accent">● loaded</span>
                      )}
                    </div>
                  </div>
                  <ConfirmButton
                    label="delete"
                    confirmLabel="confirm delete?"
                    onConfirm={() => {
                      onEvict(m.id);
                      // Refresh after a tick to let deletion complete
                      setTimeout(refresh, 500);
                    }}
                    tone="neutral"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Raw Cache API entries — useful when cache names don't map to models */}
          {cacheEntries.length > 0 && (
            <details className="mt-2">
              <summary className="font-mono text-[10px] text-mute cursor-pointer hover:text-text">
                Raw Cache API entries ({cacheEntries.length})
              </summary>
              <div className="mt-2 space-y-1">
                {cacheEntries.map((entry) => (
                  <div
                    key={entry.cacheName}
                    className="flex items-center justify-between py-1 px-2 border border-line/30 bg-bg/30"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-text/70 truncate">
                        {entry.cacheName}
                      </div>
                      <div className="font-mono text-[9px] text-mute">
                        {entry.entryCount} entries · ~{fmtBytes(entry.sizeBytes)}
                      </div>
                    </div>
                    <ConfirmButton
                      label="delete"
                      confirmLabel="confirm?"
                      onConfirm={() => handleDeleteCache(entry.cacheName)}
                      tone="neutral"
                    />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* IndexedDB stores */}
        <div className="border border-line bg-surface/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-accent" />
            <span className="font-mono text-[11px] text-text/80">IndexedDB</span>
            <span className="ml-auto font-mono text-[10px] text-mute">
              {storeStats.reduce((sum, s) => sum + s.count, 0)} total records
            </span>
          </div>

          <div className="space-y-1">
            {storeStats.map((store) => (
              <div
                key={store.name}
                className="flex items-center justify-between py-1.5 px-2 border border-line/40 bg-bg/40"
              >
                <div>
                  <span className="font-mono text-[11px] text-text/80">
                    {STORE_LABELS[store.name] ?? store.name}
                  </span>
                  <span className="ml-2 font-mono text-[10px] text-mute">
                    {store.count} {store.count === 1 ? 'record' : 'records'}
                  </span>
                </div>
                {!PROTECTED_STORES.has(store.name) && store.count > 0 && (
                  <ConfirmButton
                    label="clear"
                    confirmLabel="confirm clear?"
                    onConfirm={() => handleClearStore(store.name)}
                    tone="neutral"
                  />
                )}
              </div>
            ))}
          </div>

          {storeStats.some((s) => PROTECTED_STORES.has(s.name) && s.count > 0) && (
            <p className="font-mono text-[9px] text-mute/60 mt-1">
              API keys are protected — use Settings → Providers to manage them.
            </p>
          )}
        </div>

        {/* Full reset pointer */}
        <div className="text-center font-mono text-[10px] text-mute/60 py-2">
          Need to wipe everything?{' '}
          <button onClick={onOpenSettings} className="text-mute hover:text-text underline underline-offset-2">
            Settings → About → Reset
          </button>
        </div>
      </div>
    </div>
  );
}
