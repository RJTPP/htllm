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
      <span className="font-mono text-[11px] text-text w-12 text-right">
        {step < 1 ? value.toFixed(2) : value}
      </span>
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
