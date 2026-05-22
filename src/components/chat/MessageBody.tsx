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
          <span key={i} className="whitespace-pre-wrap break-words">
            {renderInline(seg)}
          </span>
        );
      })}
    </div>
  );
}
