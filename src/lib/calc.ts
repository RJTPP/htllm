/**
 * Arithmetic for the `calculate` tool: a recursive-descent parser, no eval
 * (the production CSP forbids it, and model input must never run as code).
 * Supports + - * / % ^, parentheses, unary minus, constants pi and e, and
 * sqrt abs floor ceil round ln log log10 exp sin cos tan min max.
 */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, exp: Math.exp,
  ln: Math.log, log: Math.log10, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  round: (x, digits = 0) => { const f = 10 ** digits; return Math.round(x * f) / f; },
  min: Math.min, max: Math.max,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function calculate(expression: string): number {
  if (expression.length > 500) throw new Error('Expression is too long (500 characters at most).');
  // Commas only separate function arguments: "1,234" is not read as a thousands
  // separator, because min(2,300) must stay two arguments.
  const src = expression;
  let i = 0;
  const peek = () => { while (src[i] === ' ') i++; return src[i]; };
  const fail = (msg: string): never => { throw new Error(`${msg} at position ${i + 1} in "${expression}".`); };
  const expect = (c: string) => { if (peek() !== c) fail(`Expected "${c}"`); i++; };
  let depth = 0;
  function expr(): number {
    let v = term();
    for (let c = peek(); c === '+' || c === '-'; c = peek()) { i++; v = c === '+' ? v + term() : v - term(); }
    return v;
  }
  function term(): number {
    let v = power();
    for (let c = peek(); c === '*' || c === '/' || c === '%'; c = peek()) {
      i++; const r = power();
      if ((c === '/' || c === '%') && r === 0) fail('Division by zero');
      v = c === '*' ? v * r : c === '/' ? v / r : v % r;
    }
    return v;
  }
  function power(): number {
    const base = unary();
    if (peek() === '^') { i++; return base ** power(); } // right-associative
    return base;
  }
  function unary(): number {
    const c = peek();
    if (c === '-') { i++; return -unary(); }
    if (c === '+') { i++; return unary(); }
    return primary();
  }
  function primary(): number {
    if (++depth > 100) fail('Expression is nested too deeply');
    try {
      const c = peek();
      if (c === '(') { i++; const v = expr(); expect(')'); return v; }
      const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?%?/i.exec(src.slice(i));
      if (num) { i += num[0].length; const n = Number(num[0].replace('%', '')); return num[0].endsWith('%') ? n / 100 : n; }
      const name = /^[a-z][a-z0-9]*/i.exec(src.slice(i));
      if (name) {
        const id = name[0].toLowerCase(); i += name[0].length;
        if (id in CONSTANTS) return CONSTANTS[id]!;
        const fn = FUNCTIONS[id];
        if (!fn) fail(`Unknown name "${name[0]}"`);
        expect('(');
        const args = [expr()];
        while (peek() === ',') { i++; args.push(expr()); }
        expect(')');
        return fn!(...args);
      }
      return fail(c === undefined ? 'Unexpected end' : `Unexpected "${c}"`);
    } finally { depth--; }
  }
  const value = expr();
  if (peek() !== undefined) fail(`Unexpected "${peek()}"`);
  if (!Number.isFinite(value)) throw new Error(`The result is not a finite number (${value}).`);
  return value;
}

/** Display a result without floating-point noise (12 significant digits). */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}
