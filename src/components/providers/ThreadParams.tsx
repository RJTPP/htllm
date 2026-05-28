import { useState, useEffect } from 'react';
import type { ModelParams, ReasoningCapability } from '../../providers/types';
import { Modal } from '../ui/Modal';
import { ParamControls } from './ParamControls';

export function ThreadParams({
  open,
  onClose,
  params,
  defaults,
  reasoningCapability,
  contextMin,
  onApply,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  params: ModelParams;
  defaults: ModelParams;
  reasoningCapability?: ReasoningCapability;
  contextMin?: number;
  onApply: (next: ModelParams) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<ModelParams>(params);

  // Re-seed the draft from the live params each time the modal opens, so
  // Esc / Cancel discards uncommitted edits.
  useEffect(() => {
    if (open) setDraft(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const overridden = JSON.stringify(draft) !== JSON.stringify(defaults);
  const dirty = JSON.stringify(draft) !== JSON.stringify(params);

  const save = () => {
    onApply(draft);
    onClose();
  };

  const reset = () => {
    onReset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thread parameters"
      subtitle="Overrides for this conversation only — Esc discards unsaved edits"
      width="max-w-md"
    >
      <div className="p-4 space-y-3">
        <ParamControls
          params={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          reasoningCapability={reasoningCapability ?? null}
          contextMin={contextMin}
        />
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="font-mono text-[10px] text-mute">
            {overridden ? 'overriding global defaults' : 'matching global defaults'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={reset}
              disabled={!overridden}
              className="font-mono text-[11px] px-2.5 py-1 border border-line text-mute hover:text-text disabled:opacity-30"
            >
              reset to defaults
            </button>
            <button
              onClick={save}
              disabled={!dirty}
              className="font-mono text-[11px] px-2.5 py-1 border border-accent/60 text-accent bg-accent/5 hover:bg-accent/10 disabled:opacity-30"
            >
              save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
