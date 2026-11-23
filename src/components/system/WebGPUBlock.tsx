/**
 * Shown in place of the chat when the active thread uses an in-browser
 * model but this browser has no WebGPU. HTTP models don't need WebGPU, so
 * this is a detour, not a dead end: offer the model picker directly.
 */
export function WebGPUBlock({ onOpenPicker }: { onOpenPicker: () => void }) {
  return (
    <div className="flex-1 grid-bg flex items-center justify-center p-6">
      <div className="max-w-md border border-line bg-surface">
        <div className="px-6 py-5 border-b border-line">
          <div className="font-mono text-[10px] text-warn uppercase tracking-widest mb-2">
            browser models unavailable
          </div>
          <h2 className="font-mono text-lg font-medium tracking-tight mb-2">
            WebGPU is not available
          </h2>
          <p className="text-sm text-mute leading-relaxed">
            In-browser models need WebGPU, which this browser doesn't provide.
            Use a recent Chrome or Edge on a desktop for those. You can still chat
            here through an HTTP model: Ollama, LM Studio or any
            OpenAI-compatible endpoint.
          </p>
        </div>
        <div className="px-6 py-4">
          <button
            onClick={onOpenPicker}
            className="font-mono text-[11px] px-3 py-1.5 border border-accent/60 text-accent hover:bg-accent/10 focus-visible:outline focus-visible:outline-accent"
          >
            use an HTTP model →
          </button>
        </div>
      </div>
    </div>
  );
}
