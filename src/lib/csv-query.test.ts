import { describe, expect, it } from 'vitest';
import { queryCsv } from './csv-query';

const csv = 'item,category,price,qty\nTent,shelter,199.5,1\nStove,kitchen,45,2\nPot,kitchen,"1,020",1\nTarp,shelter,30,3\n';

describe('queryCsv', () => {
  it('filters numerically, selects and sorts', () => {
    const out = queryCsv(csv, { columns: ['item', 'price'], filter: [{ column: 'price', op: '>', value: 40 }], sort: { column: 'price', desc: true } });
    expect(out.table.split('\n')).toEqual(['| item | price |', '| --- | --- |', '| Pot | 1,020 |', '| Tent | 199.5 |', '| Stove | 45 |']);
    expect([out.matched, out.total]).toEqual([3, 4]);
  });
  it('groups and aggregates', () => {
    const out = queryCsv(csv, { group_by: 'category', aggregate: { fn: 'sum', column: 'qty' }, sort: { column: 'sum(qty)', desc: true } });
    expect(out.table).toContain('| shelter | 4 |');
    expect(out.table).toContain('| kitchen | 3 |');
    expect(queryCsv(csv, { aggregate: { fn: 'avg', column: 'qty' } }).table).toContain('| 1.75 |');
    expect(queryCsv(csv, { filter: [{ column: 'item', op: 'contains', value: 't' }], aggregate: { fn: 'count' } }).table).toContain('| 4 |');
  });
  it('names real columns when one is missing, and limits rows', () => {
    expect(() => queryCsv(csv, { columns: ['cost'] })).toThrow('Columns: item, category, price, qty');
    expect(queryCsv(csv, { limit: 1 }).table).toContain('(3 more rows');
    expect(queryCsv('a\tb\n1\t2', { columns: ['b'] }, '\t').table).toContain('| 2 |');
    // Commas inside TSV fields stay in their column.
    expect(queryCsv('name\tamount\nACME, Inc.\t42', { columns: ['amount'] }, '\t').table).toContain('| 42 |');
  });
});

describe('queryCsv on large files', () => {
  it('aggregates 90,000 rows quickly and refuses files over the row limit instead of undercounting', async () => {
    const { MAX_CSV_ROWS } = await import('./csv-query');
    const rows = Array.from({ length: 90_000 }, (_, i) => `${i},1`).join('\n');
    const started = performance.now();
    expect(queryCsv(`id,n\n${rows}`, { aggregate: { fn: 'sum', column: 'n' } }).table).toContain('| 90000 |');
    expect(performance.now() - started).toBeLessThan(2000);
    const exact = Array.from({ length: MAX_CSV_ROWS }, () => '1').join('\n');
    expect(queryCsv(`n\n${exact}`, { aggregate: { fn: 'count' } }).table).toContain(`| ${MAX_CSV_ROWS} |`);
    expect(() => queryCsv(`n\n${exact}\n1`, { aggregate: { fn: 'count' } })).toThrow('more than');
  });
});
