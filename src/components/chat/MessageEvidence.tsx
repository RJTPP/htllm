import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Message, SourceCitation } from '../../providers/types';
import { sourceExists } from '../../data/workspace';

// Disclosures here share the ThinkingBlock look (chevron + 10px mono label)
// so tool activity, sources and reasoning read as one family. Each level
// uses a named group so a nested chevron only follows its own <details>.
const summaryBase =
  'flex cursor-pointer list-none items-center gap-1.5 text-mute hover:text-text transition-colors [&::-webkit-details-marker]:hidden';

function Chevron({ group }: { group: 'outer' | 'inner' }) {
  const rotate = group === 'outer' ? 'group-open/outer:rotate-90' : 'group-open/inner:rotate-90';
  return <ChevronRight size={12} aria-hidden="true" className={`shrink-0 transition-transform ${rotate}`} />;
}

function Label({ children }: { children: ReactNode }) {
  return <span className="min-w-0 break-words">{children}</span>;
}

function Source({ source }: { source: SourceCitation }) {
  const [missing, setMissing] = useState(false);
  const where = source.pageStart
    ? ` · p. ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ''}`
    : source.headingPath ? ` · ${source.headingPath}` : '';
  return <details className="group/inner" onToggle={(event) => { if (event.currentTarget.open) void sourceExists(source.documentId).then((exists) => setMissing(!exists)); }}>
    <summary className={summaryBase}><Chevron group="inner" /><Label>{source.filename}{where}</Label></summary>
    <div className="mt-1.5 ml-[5px] border-l-2 border-line pl-3 space-y-1.5">
      {missing && <p className="text-mute">Original document unavailable; saved evidence shown below.</p>}
      <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-text/85">{source.excerpt}</pre>
    </div>
  </details>;
}

export function MessageEvidence({ message, section = 'sources' }: { message: Message; section?: 'sources' | 'activity' }) {
  const status = message.runStatus === 'running' ? 'in progress / interrupted if reloaded' : message.runStatus;
  return <div className={`space-y-2 font-mono text-[10px] mt-2 ${section === 'activity' ? 'mb-1.5' : ''}`}>
    {section === 'sources' && message.retrievalStatus === 'no-matches' && <p className="text-mute">No matching evidence in the selected library.</p>}
    {section === 'sources' && message.retrievalStatus === 'unavailable' && <p className="text-[11px] text-err">Knowledge retrieval failed. Retry, or turn off Automatic RAG in the Knowledge panel to continue without it.</p>}
    {section === 'sources' && !!message.citations?.length && <details className="group/outer">
      <summary className={summaryBase}><Chevron group="outer" /><Label>Sources supplied to this answer ({message.citations.length})</Label></summary>
      <div className="mt-1.5 ml-[5px] border-l-2 border-line pl-3 space-y-1.5">{message.citations.map((source) => <Source key={source.id} source={source} />)}</div>
    </details>}
    {section === 'activity' && !!message.activity?.length && <details className="group/outer">
      <summary className={summaryBase}><Chevron group="outer" /><Label>Tool activity · {status}</Label></summary>
      <div className="mt-1.5 ml-[5px] border-l-2 border-line pl-3 space-y-1.5">
        {message.activity.map((event) => <details key={event.id} className="group/inner">
          <summary className={`${summaryBase} ${event.status === 'unknown' ? '!text-warn' : ''}`}><Chevron group="inner" /><Label>{event.server ? `${event.server} · ` : ''}{event.tool} · {event.status}</Label></summary>
          <div className="mt-1.5 mb-1 space-y-2">
            {event.status === 'unknown' && <p className="text-warn">The external outcome is unknown. Check the service before retrying.</p>}
            <div>
              <div className="uppercase tracking-widest text-mute mb-1">Arguments</div>
              <pre className="whitespace-pre-wrap break-all max-h-48 overflow-auto bg-surface border border-line p-2 text-[11px] text-text/85">{event.arguments}</pre>
            </div>
            {event.result && <div>
              <div className="uppercase tracking-widest text-mute mb-1">Result</div>
              <pre className="whitespace-pre-wrap break-all max-h-64 overflow-auto bg-surface border border-line p-2 text-[11px] text-text/85">{event.result}</pre>
            </div>}
          </div>
        </details>)}
      </div>
    </details>}
  </div>;
}
