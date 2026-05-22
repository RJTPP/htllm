import { useState, useEffect, useMemo } from 'react';
import { ShaderBackdrop } from './ShaderBackdrop';

const VISITED_KEY = 'htllm:visited';

const BOOT_LINES: [string, string, string][] = [
  ['webgpu adapter', 'gpu detected', 'ok'],
  ['device memory', 'probed', 'ok'],
  ['logical cores', 'probed', 'ok'],
  ['storage quota', 'available', 'ok'],
  ['webllm runtime', 'wasm · simd', 'ok'],
  ['environment', 'ready', 'done'],
];

function goToApp() {
  try {
    localStorage.setItem(VISITED_KEY, '1');
  } catch {
    // localStorage may be unavailable; navigation still proceeds.
  }
  window.location.href = '/app';
}

export default function Landing() {
  const reduce = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  // 'pending' until the first-run check completes; returning visitors redirect.
  const [phase, setPhase] = useState<'pending' | 'show'>('pending');
  const [step, setStep] = useState(reduce ? BOOT_LINES.length : 0);
  const booted = step >= BOOT_LINES.length;

  useEffect(() => {
    let visited = false;
    try {
      visited = localStorage.getItem(VISITED_KEY) != null;
    } catch {
      visited = false;
    }
    if (visited) {
      window.location.replace('/app');
    } else {
      setPhase('show');
    }
  }, []);

  useEffect(() => {
    if (phase !== 'show' || booted) return;
    const last = step === BOOT_LINES.length - 1;
    const id = setTimeout(() => setStep((s) => s + 1), last ? 360 : 240);
    return () => clearTimeout(id);
  }, [phase, step, booted]);

  useEffect(() => {
    if (phase !== 'show' || booted) return;
    const skip = () => setStep(BOOT_LINES.length);
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [phase, booted]);

  if (phase === 'pending') return null;

  const shown = BOOT_LINES.slice(0, Math.min(step + 1, BOOT_LINES.length));

  return (
    <div
      onClick={() => {
        if (!booted) setStep(BOOT_LINES.length);
      }}
      className="relative min-h-screen overflow-hidden flex items-center justify-center px-6 bg-bg text-text font-sans"
    >
      <ShaderBackdrop />
      <div className="absolute inset-0 scanlines pointer-events-none" />
      <div className="grain grain-anim pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 25%, rgba(10,10,10,0.92) 100%)',
        }}
      />

      <div className="relative max-w-2xl w-full">
        <div className="reveal font-mono font-bold leading-none mb-6 text-7xl sm:text-8xl select-none">
          <span className={booted ? 'inline-block wm-glitch' : 'inline-block'}>
            ht
            <span className="text-mute/70 font-medium">&lt;</span>
            <span className="text-accent">llm</span>
            <span className="text-mute/70 font-medium">&gt;</span>
          </span>
        </div>

        <p className="reveal reveal-1 text-mute text-base leading-relaxed mb-7 max-w-xl">
          Fully client-side WebGPU chat. Models run in your browser — no server, no
          telemetry, nothing leaves your device. Bring your own models and keys.
        </p>

        <div className="reveal reveal-2 border border-line bg-bg/75 backdrop-blur-sm mb-7 max-w-xl">
          <div className="flex items-center gap-1.5 px-3.5 py-2 border-b border-line">
            <span className="w-2.5 h-2.5 rounded-full bg-err/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-warn/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-ok/50" />
            <span className="ml-1.5 font-mono text-[11px] text-mute/70 uppercase tracking-widest">
              system probe
            </span>
          </div>
          <div className="px-3.5 py-3 font-mono text-[13px] space-y-1.5">
            {shown.map(([label, value, status], i) => {
              const active = i === step && !booted;
              if (active) {
                return (
                  <div key={label} className="flex items-baseline gap-2 text-mute">
                    <span className="text-accent">›</span>
                    <span>
                      probing {label}
                      <span className="blink text-accent">▋</span>
                    </span>
                  </div>
                );
              }
              const done = status === 'done';
              return (
                <div key={label} className="flex items-baseline gap-2">
                  <span className="text-accent/60">·</span>
                  <span className="text-mute">{label}</span>
                  <span className="flex-1 self-center border-b border-dotted border-line mx-1" />
                  <span className={done ? 'text-accent' : 'text-text'}>{value}</span>
                  <span className={done ? 'text-accent' : 'text-ok'}>
                    {done ? '✓' : 'ok'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className={`transition-all duration-500 ${
            booted
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-1 pointer-events-none'
          }`}
        >
          <button
            onClick={goToApp}
            className="font-mono text-sm px-7 py-3 bg-accent text-bg font-medium hover:bg-accent/90 transition-colors"
          >
            start →
          </button>

          <div className="grid grid-cols-3 gap-2.5 mt-8 font-mono text-[11px] max-w-xl">
            {[
              ['private', 'threads · keys stay in IndexedDB'],
              ['local', 'inference on your GPU via WebLLM'],
              ['open', 'provider-agnostic — local now, BYOK next'],
            ].map(([h, d]) => (
              <div key={h} className="border border-line bg-bg/60 backdrop-blur-sm p-3">
                <div className="text-accent uppercase tracking-widest mb-1.5">{h}</div>
                <div className="text-mute leading-relaxed">{d}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 font-mono text-[11px] text-mute/60">
            Chrome 113+ / Edge 113+ · WebGPU required
          </div>
        </div>
      </div>
    </div>
  );
}
