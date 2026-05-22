export function StorageStub() {
  return (
    <div className="flex-1 grid-bg flex items-center justify-center p-6">
      <div className="max-w-md border border-line bg-surface/40 p-6">
        <div className="font-mono text-[10px] text-accent uppercase tracking-widest mb-2">
          phase 2
        </div>
        <h2 className="font-mono text-lg font-medium tracking-tight mb-2">Storage</h2>
        <p className="text-sm text-mute leading-relaxed">
          The data &amp; cache manager — model-weight cache, IndexedDB usage and
          per-document controls — arrives in Phase 2. Data import / export and the
          full reset live in Settings until then.
        </p>
      </div>
    </div>
  );
}
