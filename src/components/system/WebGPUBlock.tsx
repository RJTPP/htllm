export function WebGPUBlock() {
  return (
    <div className="flex-1 grid-bg flex items-center justify-center p-6">
      <div className="max-w-md border border-err/40 bg-err/5 p-6">
        <div className="font-mono text-[10px] text-err uppercase tracking-widest mb-2">
          runtime unavailable
        </div>
        <h2 className="font-mono text-lg font-medium tracking-tight mb-2">
          WebGPU is not available
        </h2>
        <p className="text-sm text-mute leading-relaxed">
          In-browser inference requires WebGPU. Use the latest Chrome or Edge on a
          desktop with a discrete or integrated GPU. Firefox and Safari support is
          still partial; mobile is unsupported.
        </p>
        <div className="mt-4 font-mono text-[11px] text-mute border-t border-line pt-3">
          External providers (Ollama, LM Studio, OpenAI-compatible APIs — Phase 2)
          will work without WebGPU.
        </div>
      </div>
    </div>
  );
}
