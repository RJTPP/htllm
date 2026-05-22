import { useState, useEffect } from 'react';
import type { ModelParams } from '../../providers/types';

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const display = (v: number) => (step < 1 ? v.toFixed(2) : String(v));
  const [text, setText] = useState(display(value));

  useEffect(() => {
    setText(display(value));
  }, [value, step]);

  // The number input commits on blur / Enter so intermediate keystrokes
  // (e.g. "6" while typing "640") don't get clamped or persisted.
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isNaN(v)) {
      setText(display(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, v));
    onChange(clamped);
    setText(display(clamped));
  };

  return (
    <div className="flex items-center gap-3">
      <label className="font-mono text-[11px] text-mute w-28 shrink-0">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-accent"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="font-mono text-[11px] text-text w-16 text-right bg-surface border border-line focus:border-accent/60 focus:outline-none px-1 py-0.5"
      />
    </div>
  );
}

export function ParamControls({
  params,
  onChange,
}: {
  params: ModelParams;
  onChange: (patch: Partial<ModelParams>) => void;
}) {
  const set = (k: keyof ModelParams) => (v: number) =>
    onChange({ [k]: v } as Partial<ModelParams>);
  return (
    <div className="space-y-2.5">
      <ParamSlider
        label="context_window"
        value={params.contextWindow}
        min={1024}
        max={32768}
        step={512}
        onChange={set('contextWindow')}
      />
      <ParamSlider
        label="history_msgs"
        value={params.historyMsgs}
        min={1}
        max={32}
        step={1}
        onChange={set('historyMsgs')}
      />
      <ParamSlider
        label="temperature"
        value={params.temperature}
        min={0}
        max={2}
        step={0.05}
        onChange={set('temperature')}
      />
      <ParamSlider
        label="top_p"
        value={params.topP}
        min={0}
        max={1}
        step={0.05}
        onChange={set('topP')}
      />
      <ParamSlider
        label="max_tokens"
        value={params.maxTokens}
        min={64}
        max={16384}
        step={64}
        onChange={set('maxTokens')}
      />
      <ParamSlider
        label="presence_pen"
        value={params.presencePenalty}
        min={-2}
        max={2}
        step={0.1}
        onChange={set('presencePenalty')}
      />
      <ParamSlider
        label="frequency_pen"
        value={params.frequencyPenalty}
        min={-2}
        max={2}
        step={0.1}
        onChange={set('frequencyPenalty')}
      />
    </div>
  );
}
