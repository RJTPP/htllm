import { useState, useEffect, useMemo, useRef } from 'react';
import { Marked, type Tokens } from 'marked';
import { highlightToHtml, subscribeHighlight } from '../../lib/highlight';
import { Check, Copy } from 'lucide-react';

// ── Marked instance with custom code-block renderer ─────────────────
// We render code blocks ourselves (with a copy button), so we emit a
// placeholder that we split on later. Inline markdown (bold, italic,
// inline code, links, lists, tables, headings, hr) is handled by marked's
// default HTML output.

const CODE_DELIM = '<!--shiki-code-->';

function buildMarked(): Marked {
  const m = new Marked();
  m.use({
    renderer: {
      code(token: Tokens.Code): string {
        const lang = (token.lang ?? '').trim();
        const html = highlightToHtml(token.text, lang || undefined);
        // Encode for safe splitting: base64 the inner HTML.
        const payload = btoa(
          encodeURIComponent(
            JSON.stringify({ lang, html, raw: token.text }),
          ),
        );
        return `${CODE_DELIM}${payload}${CODE_DELIM}`;
      },
    },
  });
  return m;
}

let markedInstance: Marked | null = null;
function getMarked(): Marked {
  if (!markedInstance) markedInstance = buildMarked();
  return markedInstance;
}

// ── Code block component ────────────────────────────────────────────

function CodeBlock({ lang, html, raw }: { lang: string; html: string; raw: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = () => {
    try {
      navigator.clipboard.writeText(raw);
    } catch {
      // clipboard unavailable
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  };

  // If html came from shiki it's a full <pre><code>…</code></pre> block.
  // If it's a plain-text fallback it's just escaped text.
  const isShikiHtml = html.startsWith('<pre');

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
              <Check size={11} /> copied
            </>
          ) : (
            <>
              <Copy size={11} /> copy
            </>
          )}
        </button>
      </div>
      {isShikiHtml ? (
        <div
          className="shiki-container px-3 py-2.5 overflow-x-auto [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="px-3 py-2.5 overflow-x-auto">
          <code className="font-mono text-[12.5px] text-text/90 leading-relaxed">
            {raw}
          </code>
        </pre>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function MessageBody({ content }: { content: string }) {
  const [highlighterVersion, setHighlighterVersion] = useState(0);

  // Re-render when the highlighter finishes loading or an on-demand grammar
  // becomes available, so code blocks upgrade from plain text to highlighted.
  useEffect(() => {
    return subscribeHighlight(() => {
      // Rebuild the marked instance so the renderer picks up the new state.
      markedInstance = null;
      setHighlighterVersion((n) => n + 1);
    });
  }, []);

  const segments = useMemo(() => {
    const marked = getMarked();
    const rawHtml = marked.parse(content, { async: false }) as string;

    // Split on our code-block placeholders.
    const parts = rawHtml.split(CODE_DELIM);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        // This is a code block payload.
        try {
          const decoded = JSON.parse(decodeURIComponent(atob(part))) as {
            lang: string;
            html: string;
            raw: string;
          };
          return { kind: 'code' as const, ...decoded };
        } catch {
          return { kind: 'html' as const, html: part };
        }
      }
      return { kind: 'html' as const, html: part };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- highlighterVersion forces reparse when shiki loads
  }, [content, highlighterVersion]);

  return (
    <div className="text-[13.5px] text-text leading-relaxed prose-custom">
      {segments.map((seg, i) => {
        if (seg.kind === 'code') {
          return <CodeBlock key={i} lang={seg.lang} html={seg.html} raw={seg.raw} />;
        }
        if (!seg.html.trim()) return null;
        return (
          <div
            key={i}
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: seg.html }}
          />
        );
      })}
    </div>
  );
}
