import { useEffect, useState } from 'react';
import type { SourceCitation } from '../../providers/types';
import { getDocument } from '../../data/documents';
import { Modal } from '../ui/Modal';

export function SourceDialog({ source, onClose }: { source: SourceCitation | null; onClose: () => void }) {
  const [state, setState] = useState<'checking' | 'available' | 'missing' | 'error'>('checking');
  useEffect(() => {
    let active = true; setState('checking');
    if (source) void getDocument(source.documentId).then((doc) => { if (active) setState(doc ? 'available' : 'missing'); }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [source]);
  return <Modal open={!!source} onClose={onClose} title={source?.filename ?? 'Source evidence'} subtitle="Saved evidence supplied to this answer" width="max-w-xl">
    {source && <div className="p-4 space-y-3">
      <p className="font-mono text-[11px] text-mute">{source.pageStart ? `Page ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ''}` : source.headingPath || 'Document excerpt'}</p>
      {state === 'missing' && <p className="text-warn text-xs">Original document unavailable; saved evidence shown below.</p>}
      {state === 'error' && <p className="text-warn text-xs">Could not check the original document; saved evidence shown below.</p>}
      <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed border border-line bg-surface p-3">{source.excerpt}</pre>
    </div>}
  </Modal>;
}
