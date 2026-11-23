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

/** Above this size, rich rendering (Markdown, highlighting) falls back to plain text. */
const RICH_LIMIT = 200_000;
/** Plain text shows at most this many lines; the rest is a download away. */
const LINE_LIMIT = 5000;

/** Render a workspace file's text by type (D-27). Nothing is executed: HTML/SVG show as code. */
export function FileContent({ path, text, mimeType }: { path: string; text: string; mimeType?: string }) {
  const detected = renderKind(path, mimeType);
  const tooBig = text.length > RICH_LIMIT && detected.kind !== 'csv';
  const { kind, language } = tooBig ? { kind: 'text' as const, language: undefined } : detected;
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
  const all = text.split('\n');
  const lines = all.slice(0, LINE_LIMIT);
  const width = String(lines.length).length;
  return (
    <pre className="font-mono text-[11.5px] leading-relaxed text-text whitespace-pre-wrap break-words">
      {tooBig && <div className="font-sans text-[11px] text-mute mb-2">Large file: shown as plain text.</div>}
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span className="select-none text-mute/70 text-right shrink-0" style={{ width: `${width}ch` }}>{i + 1}</span>
          <span className="min-w-0">{line || ' '}</span>
        </div>
      ))}
      {all.length > LINE_LIMIT && <div className="font-sans text-[11px] text-mute mt-2">Showing the first {LINE_LIMIT.toLocaleString()} of {all.length.toLocaleString()} lines. Download the file to see all of it.</div>}
    </pre>
  );
}
