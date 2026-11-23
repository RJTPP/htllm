/**
 * Minimal RFC 4180 CSV parser for the viewer: quoted fields, doubled quotes,
 * commas and newlines inside quotes, CRLF. Bounded so a huge file stays fast.
 */
export function parseCsv(text: string, maxRows = 2000, delimiter = ','): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = []; let field = ''; let quoted = false; let i = 0;
  const push = () => { row.push(field); field = ''; };
  while (i < text.length) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === delimiter) { push(); i++; continue; }
    if (c === '\r' && text[i + 1] === '\n') i++;
    if (c === '\n' || c === '\r') {
      push(); rows.push(row); row = []; i++;
      if (rows.length >= maxRows) return { rows, truncated: i < text.length };
      continue;
    }
    field += c; i++;
  }
  if (field !== '' || row.length) { push(); rows.push(row); }
  return { rows, truncated: false };
}
