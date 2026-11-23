import { Paperclip, X } from 'lucide-react';
import type { MessageAttachment } from '../../providers/types';
import { fmtBytes } from '../../lib/format';
import { useWorkspaceUI } from './WorkspaceContext';

/** Files attached to a user message (or waiting for the next one), as small chips. */
export function AttachmentChips({ attachments, onRemove }: { attachments: MessageAttachment[]; onRemove?: (fileId: string) => void }) {
  const ui = useWorkspaceUI();
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((a) => {
        const name = a.path.split('/').pop() ?? a.path;
        const size = a.pages ? `${a.pages} page${a.pages === 1 ? '' : 's'}` : fmtBytes(a.chars);
        return (
          <span key={a.fileId} className="inline-flex items-center border border-line bg-surface font-mono text-[11px]">
            <button onClick={() => ui?.openFile(a.fileId)} title={`Open ${a.path}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-text hover:text-accent">
              <Paperclip size={10} className="text-mute" /> <span className="max-w-[14rem] truncate">{name}</span> <span className="text-mute">{size}</span>
            </button>
            {onRemove && (
              <button onClick={() => onRemove(a.fileId)} aria-label={`Don't attach ${name} to this message`} className="px-1 py-0.5 border-l border-line text-mute hover:text-text">
                <X size={10} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
