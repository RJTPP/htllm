import { useState, useMemo, type ReactNode } from 'react';
import { highlightCode } from '../../lib/highlight';
import { Icon } from '../ui/Icon';

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return (
        <strong key={i} className="text-text font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith('`') && p.endsWith('`'))
      return (
        <code
          key={i}
          className="font-mono text-[12px] bg-surface2 border border-line rounded px-1 py-0.5 text-accent"
        >
          {p.slice(1, -1)}
        </code>
      );
    return <span key={i}>{p}</span>;
  });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => highlightCode(code, lang.toLowerCase()), [code, lang]);
  const copy = () => {
    try {
      navigator.clipboard.writeText(code);
    } catch {
      // clipboard unavailable
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="my-2 border border-line overflow-hidden bg-[#0d0d0d]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-surface">
        <span className="font-mono text-[10px] text-mute uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 font-mono text-[10px] text-mute hover:text-text"
        >
          {copied ? (
            <>
              <Icon name="check" size={11} /> copied
            </>
          ) : (
            <>
              <Icon name="copy" size={11} /> copy
            </>
          )}
        </button>
      </div>
      <pre className="px-3 py-2.5 overflow-x-auto">
        <code className="font-mono text-[12.5px] text-text/90 leading-relaxed">
          {tokens.map(([cls, txt], i) =>
            cls ? (
              <span key={i} className={cls}>
                {txt}
              </span>
            ) : (
              <span key={i}>{txt}</span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}

function parseCells(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isSeparator(row: string): boolean {
  return /^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|?$/.test(row.trim());
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith('|') && line.trimEnd().endsWith('|');
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.split('\n');
  const result: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      result.push(
        <ul key={key++} className="my-1.5 pl-5 list-disc space-y-0.5">
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isSeparator(lines[i + 1] ?? '')
    ) {
      flushList();
      const headerCells = parseCells(line);
      const bodyRows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        bodyRows.push(parseCells(lines[i] ?? ''));
        i++;
      }
      i--;
      result.push(
        <div key={key++} className="my-2 overflow-x-auto">
          <table className="border-collapse text-[13px] font-mono">
            <thead>
              <tr>
                {headerCells.map((c, j) => (
                  <th
                    key={j}
                    className="border border-line px-3 py-1.5 text-left text-[11px] uppercase tracking-wider text-mute bg-surface"
                  >
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => (
                    <td key={ci} className="border border-line px-3 py-1.5 text-text/90">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushList();
      result.push(<hr key={key++} className="my-3 border-line" />);
      continue;
    }

    const bullet = line.match(/^[ \t]*[-*][ \t]+(.*)$/);
    if (bullet) {
      listItems.push(
        <li key={key++} className="break-words">
          {renderInline(bullet[1] ?? '')}
        </li>,
      );
      continue;
    }

    flushList();

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = heading[2] ?? '';
      const cls =
        level === 1
          ? 'text-[18px] font-semibold mt-4 mb-1.5'
          : level === 2
            ? 'text-[16px] font-semibold mt-3 mb-1'
            : level === 3
              ? 'text-[14.5px] font-semibold mt-2.5 mb-0.5'
              : 'text-[13.5px] font-semibold mt-2 mb-0.5';
      result.push(
        <div key={key++} className={cls}>
          {renderInline(text)}
        </div>,
      );
      continue;
    }

    if (i > 0) result.push(<br key={key++} />);
    result.push(
      <span key={key++} className="break-words">
        {renderInline(line)}
      </span>,
    );
  }
  flushList();
  return result;
}

export function MessageBody({ content }: { content: string }) {
  const segments = content.split(/```/);
  return (
    <div className="text-[13.5px] text-text leading-relaxed">
      {segments.map((seg, i) => {
        if (i % 2 === 1) {
          const nl = seg.indexOf('\n');
          const lang = nl > -1 ? seg.slice(0, nl).trim() : '';
          const code = nl > -1 ? seg.slice(nl + 1).replace(/\n$/, '') : seg;
          return <CodeBlock key={i} lang={lang} code={code} />;
        }
        return (
          <span key={i} className="whitespace-pre-wrap">
            {renderBlocks(seg)}
          </span>
        );
      })}
    </div>
  );
}
