import { Download, FileText } from 'lucide-react';
import type { PresentedFile } from '../../providers/types';
import { useWorkspaceUI } from './WorkspaceContext';
import { downloadVersion } from './WorkspacePanel';

/** D-26: files the model presented in this reply, as cards that open the side panel. */
export function PresentedFiles({ files }: { files: PresentedFile[] }) {
  const ui = useWorkspaceUI();
  return (
    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
      {files.map((file) => {
        const name = file.path.split('/').pop() ?? file.path;
        return (
          <div key={file.fileId} className="flex items-stretch border border-line bg-surface hover:border-accent/50 transition-colors">
            <button
              onClick={() => ui?.openFile(file.fileId, file.version)}
              aria-label={`Open ${name} v${file.version}`}
              className="flex-1 min-w-0 flex items-start gap-2 px-3 py-2 text-left focus-visible:outline focus-visible:outline-accent"
            >
              <FileText size={14} className="text-accent shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block font-mono text-[12px] text-text truncate">{name} <span className="text-mute">v{file.version}</span></span>
                {file.caption && <span className="block text-[12px] text-mute leading-snug mt-0.5 line-clamp-2">{file.caption}</span>}
              </span>
            </button>
            <button
              onClick={() => void downloadVersion(file.fileId, file.version)}
              aria-label={`Download ${name} v${file.version}`}
              className="px-2.5 border-l border-line text-mute hover:text-text focus-visible:outline focus-visible:outline-accent"
            >
              <Download size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
