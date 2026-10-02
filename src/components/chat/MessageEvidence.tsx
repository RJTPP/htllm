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
export function MessageEvidence({ message }: { message: Message }) {
  return <div className="space-y-2 text-xs mt-2">
    {message.retrievalStatus === 'no-matches' && <p className="text-mute">No matching evidence in the selected library.</p>}
    {message.retrievalStatus === 'unavailable' && <p className="text-red-400">Knowledge retrieval failed. Retry, or explicitly select Knowledge → None to continue without it.</p>}
    {!!message.citations?.length && <details><summary className="cursor-pointer text-accent">Sources supplied to this answer ({message.citations.length})</summary>
      <div className="space-y-1 mt-2">{message.citations.map((source) => <Source key={source.id} source={source} />)}</div>
    </details>}
    {!!message.activity?.length && <details><summary className="cursor-pointer text-mute">Tool activity · {message.runStatus === 'running' ? 'in progress / interrupted if reloaded' : message.runStatus}</summary>
      {message.activity.map((event) => <details key={event.id} className="p-2 border border-line"><summary>{event.server ? `${event.server} · ` : ''}{event.tool} · {event.status}</summary>
        <pre className="whitespace-pre-wrap break-all">{event.arguments}</pre><pre className="whitespace-pre-wrap break-all">{event.result}</pre>
      </details>)}
    </details>}
  </div>;
}
