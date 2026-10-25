// Minimal RFC 4180 CSV reader: commas, double-quoted fields, "" escapes, CRLF or LF line endings.
// Structural problems reject the whole file with a readable message; nothing is half-read.

export type CsvParseResult = { ok: true; header: string[]; rows: { line: number; cells: string[] }[] } | { ok: false; error: string };

export function parseCsv(input: string): CsvParseResult {
  const text = input.replace(/^﻿/, '');
  if (text.includes('\u0000')) return { ok: false, error: "This doesn't look like a CSV text file." };
  if (!text.trim()) return { ok: false, error: 'The file is empty.' };

  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let quoteStartLine = 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field !== '') return { ok: false, error: `Line ${line}: a quote appears in the middle of a value.` };
      inQuotes = true;
      quoteStartLine = line;
    } else if (ch === ',') {
      cells.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cells.push(field);
      records.push({ line: recordLine, cells });
      cells = [];
      field = '';
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (inQuotes) return { ok: false, error: `Line ${quoteStartLine}: a quoted value is never closed.` };
  if (field !== '' || cells.length) {
    cells.push(field);
    records.push({ line: recordLine, cells });
  }

  const nonBlank = records.filter((r) => r.cells.some((c) => c.trim() !== ''));
  const [headerRecord, ...rows] = nonBlank;
  if (!headerRecord) return { ok: false, error: 'The file is empty.' };
  const header = headerRecord.cells.map((h) => h.trim());
  if (header.length < 2) {
    const hint = /[;\t]/.test(header[0] ?? '') ? ' It looks semicolon- or tab-separated; save it as comma-separated (CSV).' : '';
    return { ok: false, error: `The first line needs at least two comma-separated column names.${hint}` };
  }
  if (header.some((h) => !h)) return { ok: false, error: 'The header row has a blank column name.' };
  const seen = new Set<string>();
  for (const h of header) {
    if (seen.has(h.toLowerCase())) return { ok: false, error: `The column name "${h}" appears twice.` };
    seen.add(h.toLowerCase());
  }
  for (const r of rows) {
    if (r.cells.length !== header.length) {
      return { ok: false, error: `Line ${r.line} has ${r.cells.length} values but the header has ${header.length} columns.` };
    }
  }
  if (rows.length === 0) return { ok: false, error: 'The file has a header but no data rows.' };
  return { ok: true, header, rows: rows.map((r) => ({ line: r.line, cells: r.cells.map((c) => c.trim()) })) };
}
