/**
 * Hand-rolled syntax tokenizer. Not a full parser — covers JS/TS, Python,
 * Rust, Go, C/C++, bash/shell, SQL, Ruby, JSON, HTML and CSS reasonably.
 * Returns an array of [className | null, text] pairs. No dependency.
 */

export type Token = [string | null, string];

const KW = {
  js: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|new|this|class|extends|super|import|export|from|as|async|await|yield|try|catch|finally|throw|typeof|instanceof|in|of|delete|void|null|undefined)\b/,
  ts: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|new|this|class|extends|super|import|export|from|as|async|await|yield|try|catch|finally|throw|typeof|instanceof|in|of|delete|void|null|undefined|interface|type|enum|namespace|readonly|public|private|protected|abstract|implements|keyof)\b/,
  py: /\b(def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|with|try|except|finally|raise|lambda|yield|async|await|in|is|not|and|or|None|True|False|global|nonlocal)\b/,
  rs: /\b(fn|let|mut|const|static|struct|enum|impl|trait|pub|use|mod|crate|self|Self|super|return|if|else|match|for|while|loop|break|continue|in|as|where|ref|move|async|await|dyn|box|unsafe|extern)\b/,
  go: /\b(func|var|const|type|struct|interface|package|import|return|if|else|for|range|switch|case|default|break|continue|go|chan|defer|select|map|nil|true|false)\b/,
  c: /\b(int|char|float|double|void|short|long|signed|unsigned|struct|enum|union|typedef|static|extern|const|volatile|return|if|else|for|while|do|switch|case|default|break|continue|sizeof|NULL|true|false)\b/,
  sh: /\b(if|then|fi|else|elif|for|while|do|done|case|esac|in|function|return|export|local|readonly|echo|printf|read|cd|exit)\b/,
  sql: /\b(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|INDEX|VIEW|AS|AND|OR|NOT|NULL|IS|IN|EXISTS|DISTINCT|UNION|ALL|CASE|WHEN|THEN|ELSE|END)\b/i,
  rb: /\b(def|end|class|module|do|return|if|elsif|else|unless|while|until|for|in|case|when|then|begin|rescue|ensure|raise|require|require_relative|attr_accessor|attr_reader|attr_writer|self|nil|true|false|and|or|not|yield)\b/,
};

const BOOL = /\b(true|false|null|undefined|None|True|False|nil|NULL)\b/;

const ALIAS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  jsx: 'js',
  tsx: 'ts',
  python: 'py',
  rust: 'rs',
  golang: 'go',
  'c++': 'c',
  cpp: 'c',
  'c#': 'c',
  shell: 'sh',
  bash: 'sh',
  zsh: 'sh',
  ruby: 'rb',
};

export function highlightCode(code: string, langRaw?: string): Token[] {
  const lang = ALIAS[langRaw ?? ''] || langRaw || 'js';

  if (lang === 'json') return highlightJSON(code);
  if (lang === 'html' || lang === 'xml') return highlightHTML(code);
  if (lang === 'css') return highlightCSS(code);

  const out: Token[] = [];
  const kw = KW[lang as keyof typeof KW] ?? KW.js;

  const patterns: [RegExp, string | null][] = [
    [/^\/\*[\s\S]*?\*\//, 'tok-com'],
    [/^\/\/[^\n]*/, 'tok-com'],
    [/^#[^\n]*/, 'tok-com'],
    [/^"""[\s\S]*?"""/, 'tok-str'],
    [/^'''[\s\S]*?'''/, 'tok-str'],
    [/^`(?:\\.|\$\{[^}]*\}|[^`\\])*`/, 'tok-str'],
    [/^"(?:\\.|[^"\\])*"/, 'tok-str'],
    [/^'(?:\\.|[^'\\])*'/, 'tok-str'],
    [/^\b\d+\.?\d*(?:e[+-]?\d+)?\b/i, 'tok-num'],
    [BOOL, 'tok-bool'],
    [kw, 'tok-key'],
    [/^\b[A-Z][A-Za-z0-9_]*\b/, 'tok-typ'],
    [/^\b[a-z_$][\w$]*(?=\s*\()/, 'tok-fn'],
    [/^\b[a-zA-Z_$][\w$]*\b/, null],
    [/^[+\-*/%=<>!&|^~?:]+/, 'tok-op'],
    [/^[{}[\]().,;]/, 'tok-punc'],
    [/^\s+/, null],
    [/^./, null],
  ];

  let s = code;
  while (s.length) {
    let matched = false;
    for (const [re, cls] of patterns) {
      const m = s.match(re);
      if (m && m.index === 0 && m[0].length > 0) {
        out.push([cls, m[0]]);
        s = s.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push([null, s.charAt(0)]);
      s = s.slice(1);
    }
  }
  return out;
}

function highlightJSON(code: string): Token[] {
  const out: Token[] = [];
  let s = code;
  while (s.length) {
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^"(?:\\.|[^"\\])*"(?=\s*:)/))) {
      out.push(['tok-attr', m[0]]);
    } else if ((m = s.match(/^"(?:\\.|[^"\\])*"/))) {
      out.push(['tok-str', m[0]]);
    } else if ((m = s.match(/^-?\b\d+\.?\d*(?:e[+-]?\d+)?\b/i))) {
      out.push(['tok-num', m[0]]);
    } else if ((m = s.match(/^\b(true|false|null)\b/))) {
      out.push(['tok-bool', m[0]]);
    } else if ((m = s.match(/^[{}[\],:]/))) {
      out.push(['tok-punc', m[0]]);
    } else if ((m = s.match(/^\s+/))) {
      out.push([null, m[0]]);
    } else {
      out.push([null, s.charAt(0)]);
      s = s.slice(1);
      continue;
    }
    s = s.slice(m[0].length);
  }
  return out;
}

function highlightHTML(code: string): Token[] {
  const out: Token[] = [];
  let s = code;
  const tagRe =
    /^<\/?([a-zA-Z][\w-]*)((?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s>]+))?)*)\s*\/?>/;
  while (s.length) {
    if (s.startsWith('<!--')) {
      const end = s.indexOf('-->');
      const stop = end === -1 ? s.length : end + 3;
      out.push(['tok-com', s.slice(0, stop)]);
      s = s.slice(stop);
      continue;
    }
    const m = s.match(tagRe);
    if (m) {
      const full = m[0];
      const isClose = full.startsWith('</');
      out.push(['tok-punc', isClose ? '</' : '<']);
      out.push(['tok-tag', m[1] ?? '']);
      let attrs: string = m[2] ?? '';
      while (attrs.length) {
        const a = attrs.match(
          /^\s+([a-zA-Z-]+)(\s*=\s*)?("[^"]*"|'[^']*'|\{[^}]*\}|[^\s>]+)?/,
        );
        if (!a) break;
        const am = a[0] ?? '';
        const lead = am.match(/^\s+/);
        out.push([null, lead ? (lead[0] ?? '') : '']);
        out.push(['tok-attr', a[1] ?? '']);
        if (a[2]) {
          out.push(['tok-op', a[2]]);
          out.push(['tok-str', a[3] ?? '']);
        }
        attrs = attrs.slice(am.length);
      }
      out.push(['tok-punc', full.endsWith('/>') ? '/>' : '>']);
      s = s.slice(full.length);
      continue;
    }
    const next = s.indexOf('<');
    const stop = next === -1 ? s.length : next;
    out.push([null, s.slice(0, stop)]);
    s = s.slice(stop || 1);
  }
  return out;
}

function highlightCSS(code: string): Token[] {
  const out: Token[] = [];
  let s = code;
  while (s.length) {
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^\/\*[\s\S]*?\*\//))) {
      out.push(['tok-com', m[0]]);
    } else if ((m = s.match(/^"[^"]*"|^'[^']*'/))) {
      out.push(['tok-str', m[0]]);
    } else if ((m = s.match(/^-?\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms|deg)?/))) {
      out.push(['tok-num', m[0]]);
    } else if ((m = s.match(/^#[a-fA-F0-9]{3,8}/))) {
      out.push(['tok-num', m[0]]);
    } else if ((m = s.match(/^@[a-zA-Z-]+/))) {
      out.push(['tok-key', m[0]]);
    } else if ((m = s.match(/^[.#&][\w-]+/))) {
      out.push(['tok-typ', m[0]]);
    } else if ((m = s.match(/^[a-zA-Z-]+(?=\s*:)/))) {
      out.push(['tok-attr', m[0]]);
    } else if ((m = s.match(/^[{};:,()]/))) {
      out.push(['tok-punc', m[0]]);
    } else if ((m = s.match(/^\s+/))) {
      out.push([null, m[0]]);
    } else {
      out.push([null, s.charAt(0)]);
      s = s.slice(1);
      continue;
    }
    s = s.slice(m[0].length);
  }
  return out;
}
