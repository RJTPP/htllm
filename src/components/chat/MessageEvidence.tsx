import { useState } from 'react';
import type { Message, SourceCitation } from '../../providers/types';
import { getDocument } from '../../data/documents';
function Source({ source }: { source: SourceCitation }) {
  const [missing, setMissing] = useState(false);
  return <details onToggle={(event) => { if (event.currentTarget.open) void getDocument(source.documentId).then((doc) => setMissing(!doc)); }} className="border border-line p-2">
    <summary className="cursor-pointer">{source.filename}{source.pageStart ? ` · p. ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ''}` : source.headingPath ? ` · ${source.headingPath}` : ''}</summary>
    {missing && <p className="text-mute">Original document unavailable; saved evidence shown below.</p>}
    <pre className="whitespace-pre-wrap font-sans text-xs mt-2">{source.excerpt}</pre>
  </details>;
}
export function MessageEvidence({ message, section = 'sources' }: { message: Message; section?: 'sources' | 'activity' }) {
  return <div className="space-y-2 font-mono text-[11px] mt-2">
    {section === 'sources' && message.retrievalStatus === 'no-matches' && <p className="text-mute">No matching evidence in the selected library.</p>}
    {section === 'sources' && message.retrievalStatus === 'unavailable' && <p className="text-red-400">Knowledge retrieval failed. Retry, or turn off Automatic RAG in Tools → Documents to continue without it.</p>}
    {section === 'sources' && !!message.citations?.length && <details><summary className="cursor-pointer text-accent">Sources supplied to this answer ({message.citations.length})</summary>
      <div className="space-y-1 mt-2">{message.citations.map((source) => <Source key={source.id} source={source} />)}</div>
    </details>}
    {section === 'activity' && !!message.activity?.length && <details><summary className="cursor-pointer text-mute">Tool activity · {message.runStatus === 'running' ? 'in progress / interrupted if reloaded' : message.runStatus}</summary>
      {message.activity.map((event) => <details key={event.id} className="p-3 mt-2 border border-line bg-surface"><summary className={`cursor-pointer break-words ${event.status === 'unknown' ? 'text-warn' : 'text-mute'}`}>{event.server ? `${event.server} · ` : ''}{event.tool} · {event.status}</summary>
        {event.status === 'unknown' && <p className="text-warn mt-2">The external outcome is unknown. Check the service before retrying.</p>}
        <div className="text-[10px] uppercase tracking-widest text-mute mt-3 mb-1">Arguments</div>
        <pre className="whitespace-pre-wrap break-all max-h-48 overflow-auto bg-bg border border-line p-2">{event.arguments}</pre>
        {event.result && <><div className="text-[10px] uppercase tracking-widest text-mute mt-3 mb-1">Result</div><pre className="whitespace-pre-wrap break-all max-h-64 overflow-auto bg-bg border border-line p-2">{event.result}</pre></>}
      </details>)}
    </details>}
  </div>;
}
