import type { ModelParams } from '../../providers/types';
import { Modal } from '../ui/Modal';
import { ParamControls } from './ParamControls';

export function ThreadParams({
  open,
  onClose,
  params,
  defaults,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  params: ModelParams;
  defaults: ModelParams;
  onChange: (patch: Partial<ModelParams>) => void;
  onReset: () => void;
}) {
  const overridden = JSON.stringify(params) !== JSON.stringify(defaults);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thread parameters"
      subtitle="Overrides for this conversation only"
      width="max-w-md"
    >
      <div className="p-4 space-y-3">
        <ParamControls params={params} onChange={onChange} />
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="font-mono text-[10px] text-mute">
            {overridden ? 'overriding global defaults' : 'matching global defaults'}
          </span>
          <button
            onClick={onReset}
            disabled={!overridden}
            className="font-mono text-[11px] px-2.5 py-1 border border-line text-mute hover:text-text disabled:opacity-30"
          >
            reset to defaults
          </button>
        </div>
      </div>
    </Modal>
  );
}
