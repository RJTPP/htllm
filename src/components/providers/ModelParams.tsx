import { useState } from 'react';
import type { ModelParams as ModelParamsType } from '../../providers/types';

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
  return (
    <div className="flex items-center gap-3">
      <label className="font-mono text-[11px] text-mute w-28 shrink-0">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-accent"
      />
      <span className="font-mono text-[11px] text-text w-10 text-right">
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
  );
}

export function ModelParamsPanel({
  params,
  onChange,
}: {
  params: ModelParamsType;
  onChange: (patch: Partial<ModelParamsType>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-line">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 font-mono text-[11px] text-mute hover:text-text"
      >
        <span>parameters</span>
        <span>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2.5">
          <ParamSlider
            label="temperature"
            value={params.temperature}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => onChange({ temperature: v })}
          />
          <ParamSlider
            label="top_p"
            value={params.topP}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => onChange({ topP: v })}
          />
          <ParamSlider
            label="max_tokens"
            value={params.maxTokens}
            min={64}
            max={16384}
            step={64}
            onChange={(v) => onChange({ maxTokens: v })}
          />
          <ParamSlider
            label="presence_pen"
            value={params.presencePenalty}
            min={-2}
            max={2}
            step={0.1}
            onChange={(v) => onChange({ presencePenalty: v })}
          />
          <ParamSlider
            label="frequency_pen"
            value={params.frequencyPenalty}
            min={-2}
            max={2}
            step={0.1}
            onChange={(v) => onChange({ frequencyPenalty: v })}
          />
        </div>
      )}
    </div>
  );
}
