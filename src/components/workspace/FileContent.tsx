import { useMemo } from 'react';
import { MessageBody } from '../chat/MessageBody';
import { renderKind } from '../../lib/file-kind';
import { parseCsv } from '../../lib/csv';

/** A Markdown code fence longer than any backtick run inside `text`. */
function fenced(text: string, language = ''): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language}\n${text}\n${fence}`;
}

/** Render a workspace file's text by type (D-27). Nothing is executed: HTML/SVG show as code. */
export function FileContent({ path, text, mimeType }: { path: string; text: string; mimeType?: string }) {
  const { kind, language } = renderKind(path, mimeType);
  const csv = useMemo(() => (kind === 'csv' ? parseCsv(text) : null), [kind, text]);
  const json = useMemo(() => {
    if (kind !== 'json') return null;
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return null; }
  }, [kind, text]);

  if (!text) return <p className="font-mono text-[11px] text-mute">This version is empty.</p>;
  if (kind === 'markdown') return <MessageBody content={text} />;
  if (csv) {
    const [head = [], ...rows] = csv.rows;
    return (
      <div className="overflow-auto border border-line">
        <table className="font-mono text-[11px] border-collapse min-w-full">
          <thead className="bg-surface sticky top-0"><tr>{head.map((cell, i) => <th key={i} className="text-left px-2 py-1.5 border-b border-line text-text font-medium whitespace-nowrap">{cell}</th>)}</tr></thead>
          <tbody>{rows.map((row, r) => <tr key={r} className="odd:bg-surface/40">{row.map((cell, c) => <td key={c} className="px-2 py-1 border-b border-line/60 text-text align-top whitespace-pre-wrap">{cell}</td>)}</tr>)}</tbody>
        </table>
        {csv.truncated && <p className="font-mono text-[10px] text-mute p-2">Showing the first {csv.rows.length} rows. Download the file to see all of it.</p>}
      </div>
    );
  }
  if (kind === 'json' && json !== null) return <MessageBody content={fenced(json, 'json')} />;
  if (kind === 'code') return <MessageBody content={fenced(text, language)} />;
  const lines = text.split('\n');
  const width = String(lines.length).length;
  return (
    <pre className="font-mono text-[11.5px] leading-relaxed text-text whitespace-pre-wrap break-words">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span className="select-none text-mute/70 text-right shrink-0" style={{ width: `${width}ch` }}>{i + 1}</span>
          <span className="min-w-0">{line || ' '}</span>
        </div>
      ))}
    </pre>
  );
}
