import { parseCsv } from './csv';
import { formatNumber } from './calc';

export interface CsvFilter { column: string; op: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains'; value: string | number }
export interface CsvQuery {
  columns?: string[];
  filter?: CsvFilter[];
  group_by?: string;
  aggregate?: { fn: 'count' | 'sum' | 'avg' | 'min' | 'max'; column?: string };
  sort?: { column: string; desc?: boolean };
  limit?: number;
}

const num = (v: string | number): number | null => {
  if (typeof v === 'number') return v;
  const n = Number(v.replace(/[,\s]/g, '').replace(/^\$/, ''));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};
const cell = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Filter, group, aggregate and sort a CSV (first row = header) and return a
 * Markdown table. Comparisons are numeric when both sides parse as numbers.
 */
/** Largest file query_csv answers for; above it, totals would silently be wrong. */
export const MAX_CSV_ROWS = 200_000;

export function queryCsv(text: string, q: CsvQuery, separator = ','): { table: string; matched: number; total: number } {
  // +1 for the header row; a truncated parse means the file is too large to answer correctly.
  const { rows: all, truncated } = parseCsv(text, MAX_CSV_ROWS + 1, separator);
  if (truncated) throw new Error(`This file has more than ${MAX_CSV_ROWS.toLocaleString()} rows; query_csv would give incomplete totals. Use grep or read_file on parts of it instead.`);
  const [header = [], ...rows] = all.filter((r) => r.some((c) => c.trim() !== ''));
  const col = (name: string) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase());
    if (i < 0) throw new Error(`No column "${name}". Columns: ${header.join(', ')}.`);
    return i;
  };
  let matched = rows;
  for (const f of q.filter ?? []) {
    const i = col(f.column);
    matched = matched.filter((r) => {
      const a = r[i] ?? ''; const an = num(a); const bn = num(f.value);
      const cmp = an !== null && bn !== null ? an - bn : a.localeCompare(String(f.value), undefined, { sensitivity: 'accent' });
      switch (f.op) {
        case '=': return cmp === 0; case '!=': return cmp !== 0; case '>': return cmp > 0; case '<': return cmp < 0;
        case '>=': return cmp >= 0; case '<=': return cmp <= 0;
        case 'contains': return a.toLowerCase().includes(String(f.value).toLowerCase());
      }
    });
  }
  let outHeader: string[]; let out: string[][];
  if (q.aggregate || q.group_by) {
    const agg = q.aggregate ?? { fn: 'count' as const };
    const ai = agg.column ? col(agg.column) : -1;
    if (agg.fn !== 'count' && ai < 0) throw new Error(`${agg.fn} needs a column.`);
    const gi = q.group_by ? col(q.group_by) : -1;
    const groups = new Map<string, string[][]>();
    for (const r of matched) {
      const k = gi < 0 ? '' : r[gi] ?? '';
      const group = groups.get(k);
      if (group) group.push(r); else groups.set(k, [r]);
    }
    const label = agg.fn === 'count' ? 'count' : `${agg.fn}(${header[ai]})`;
    outHeader = gi < 0 ? [label] : [header[gi]!, label];
    out = [...groups].map(([k, rs]) => {
      const values = rs.map((r) => num(r[ai] ?? '')).filter((v): v is number => v !== null);
      const v = agg.fn === 'count' ? rs.length
        : !values.length ? NaN
        : agg.fn === 'sum' ? values.reduce((a, b) => a + b, 0)
        : agg.fn === 'avg' ? values.reduce((a, b) => a + b, 0) / values.length
        : agg.fn === 'min' ? Math.min(...values) : Math.max(...values);
      const shown = Number.isNaN(v) ? '(no numbers)' : formatNumber(v);
      return gi < 0 ? [shown] : [k, shown];
    });
  } else {
    const idx = q.columns?.length ? q.columns.map(col) : header.map((_, i) => i);
    outHeader = idx.map((i) => header[i]!);
    out = matched.map((r) => idx.map((i) => r[i] ?? ''));
  }
  if (q.sort) {
    const si = outHeader.findIndex((h) => h.toLowerCase() === q.sort!.column.toLowerCase());
    if (si < 0) throw new Error(`Cannot sort by "${q.sort.column}"; result columns: ${outHeader.join(', ')}.`);
    out.sort((a, b) => {
      const an = num(a[si] ?? ''); const bn = num(b[si] ?? '');
      const c = an !== null && bn !== null ? an - bn : (a[si] ?? '').localeCompare(b[si] ?? '');
      return q.sort!.desc ? -c : c;
    });
  }
  const limit = Math.min(Math.max(1, q.limit ?? 20), 200);
  const shown = out.slice(0, limit);
  const table = [`| ${outHeader.map(cell).join(' | ')} |`, `| ${outHeader.map(() => '---').join(' | ')} |`, ...shown.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
  return { table: out.length > limit ? `${table}\n(${out.length - limit} more rows; raise limit or narrow the filter.)` : table, matched: matched.length, total: rows.length };
}
