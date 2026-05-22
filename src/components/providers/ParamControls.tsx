import { useState, useEffect } from 'react';
import type { ModelParams, ReasoningEffort, ReasoningCapability } from '../../providers/types';

const EFFORT_LEVELS: { value: ReasoningEffort; label: string; description: string }[] = [
  { value: 'off', label: 'OFF', description: 'No reasoning' },
  { value: 'low', label: 'LOW', description: 'Brief reasoning' },
  { value: 'medium', label: 'MED', description: 'Moderate reasoning' },
  { value: 'high', label: 'HIGH', description: 'Full reasoning' },
];

const TOGGLE_LEVELS: { value: ReasoningEffort; label: string; description: string }[] = [
  { value: 'off', label: 'OFF', description: 'Thinking disabled' },
  { value: 'high', label: 'ON', description: 'Thinking enabled' },
];

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
  reasoningCapability,
}: {
  params: ModelParams;
  onChange: (patch: Partial<ModelParams>) => void;
  /** Pass the active model's reasoning capability to show the right control.
   *  Omit to always show the full control (e.g. in global defaults). */
  reasoningCapability?: ReasoningCapability | null;
}) {
  const levels = reasoningCapability === 'toggle' ? TOGGLE_LEVELS : EFFORT_LEVELS;

  // For toggle mode, map any non-off value to 'high' for display purposes.
  const activeValue =
    reasoningCapability === 'toggle' && params.reasoningEffort !== 'off'
      ? 'high'
      : params.reasoningEffort;

  const set = (k: keyof ModelParams) => (v: number) =>
    onChange({ [k]: v } as Partial<ModelParams>);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3" title={
        reasoningCapability === null ? 'Reasoning control — may not apply to this model' : undefined
      }>
        <label className="font-mono text-[11px] text-mute w-28 shrink-0">reasoning</label>
        <div className="flex-1 flex gap-1">
          {levels.map((level) => (
            <button
              key={level.value}
              onClick={() => onChange({ reasoningEffort: level.value })}
              className={`flex-1 font-mono text-[10px] px-2 py-1 border transition-colors ${
                activeValue === level.value
                  ? level.value === 'off'
                    ? 'border-line text-mute bg-surface'
                    : 'border-accent/60 text-accent bg-accent/10'
                  : 'border-line text-mute/60 hover:text-mute'
              }`}
              title={level.description}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>
      <ParamSlider
        label="context_window"
        value={params.contextWindow}
        min={1024}
        max={32768}
        step={512}
        onChange={set('contextWindow')}
      />
      <div className="flex items-center gap-3">
        <label className="font-mono text-[11px] text-mute w-28 shrink-0">history_msgs</label>
        {params.historyMsgs === 0 ? (
          <span className="flex-1 font-mono text-[11px] text-accent">all messages</span>
        ) : (
          <>
            <input
              type="range"
              min={1}
              max={128}
              step={1}
              value={params.historyMsgs}
              onChange={(e) => onChange({ historyMsgs: parseInt(e.target.value) })}
              className="flex-1 h-1 accent-accent"
            />
            <span className="font-mono text-[11px] text-text w-16 text-right">{params.historyMsgs}</span>
          </>
        )}
        <button
          onClick={() => onChange({ historyMsgs: params.historyMsgs === 0 ? 12 : 0 })}
          className={`font-mono text-[10px] px-1.5 py-0.5 border ${
            params.historyMsgs === 0
              ? 'border-accent/60 text-accent bg-accent/10'
              : 'border-line text-mute hover:text-text'
          }`}
        >
          all
        </button>
      </div>
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
