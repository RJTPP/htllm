import { useRef, useState, useCallback } from 'react';
import { exportAllData, importAllData, downloadJson, readFileAsText } from '../../lib/export';

export function ImportExport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    try {
      const json = await exportAllData();
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(json, `htllm-export-${date}.json`);
      setStatus('Exported successfully');
    } catch (err) {
      setStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('This will replace all existing data. Continue?')) {
      e.target.value = '';
      return;
    }

    try {
      const json = await readFileAsText(file);
      await importAllData(json);
      setStatus('Imported successfully — reload to see changes');
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    e.target.value = '';
  }, []);

  return (
    <div className="px-3 py-2 border-t border-line">
      <div className="font-mono text-[10px] text-mute uppercase tracking-widest mb-2">
        data
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          className="font-mono text-[11px] px-2.5 py-1 border border-line text-mute hover:bg-surface2 hover:text-text"
        >
          export
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="font-mono text-[11px] px-2.5 py-1 border border-line text-mute hover:bg-surface2 hover:text-text"
        >
          import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>
      {status && (
        <div className="font-mono text-[10px] text-mute mt-1">{status}</div>
      )}
    </div>
  );
}
