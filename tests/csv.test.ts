import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCsvRows, guessMapping } from '../src/valuations/csv/import';
import { parseCsv } from '../src/valuations/csv/parse';
import { loadCsvLibrary, saveCsvSet, type CsvSet } from '../src/valuations/csv/store';
import { memoryStore } from '../src/storage/idb';

const sample = readFileSync('tests/fixtures/csv/synthetic-sample.csv', 'utf8');

describe('CSV parsing', () => {
  it('reads quoted values, commas inside quotes, and a BOM', () => {
    const r = parseCsv('﻿' + sample);
    if (!r.ok) throw new Error(r.error);
    expect(r.header).toEqual(['Player', 'Sleeper ID', 'Pos', 'Team', 'Value', 'Rank']);
    expect(r.rows).toHaveLength(5);
    expect(r.rows[1]!.cells[4]).toBe('6,500');
    expect(r.rows[2]!.cells[0]).toBe('Williams, Javonte');
  });

  it('handles CRLF line endings and escaped quotes', () => {
    const r = parseCsv('a,b\r\n"say ""hi""",2\r\n');
    expect(r).toEqual({ ok: true, header: ['a', 'b'], rows: [{ line: 2, cells: ['say "hi"', '2'] }] });
  });

  it.each([
    ['empty file', '', /empty/],
    ['only whitespace', ' \n \n', /empty/],
    ['header only', 'id,value\n', /no data rows/],
    ['ragged row', 'id,value\n1,2\n3\n', /Line 3 has 1 values but the header has 2/],
    ['unclosed quote', 'id,value\n"1,2\n', /never closed/],
    ['semicolon-separated', 'id;value\n1;2\n', /semicolon/],
    ['duplicate column', 'id,ID\n1,2\n', /appears twice/],
    ['binary file', 'PK\u0003\u0004\u0000\u0000', /doesn't look like a CSV/],
  ])('rejects a malformed file: %s', (_, text, message) => {
    const r = parseCsv(text);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(message);
  });
});

describe('CSV rows and validation', () => {
  const parsed = parseCsv(sample);
  if (!parsed.ok) throw new Error();

  it('guesses obvious columns', () => {
    expect(guessMapping(parsed.header)).toEqual({ sleeperId: 1, value: 4, name: 0, position: 2, team: 3, rank: 5 });
  });

  it('builds valid rows, accepting thousands separators', () => {
    const r = buildCsvRows(parsed.rows, guessMapping(parsed.header));
    expect(r.blocking).toEqual([]);
    expect(r.validCount).toBe(5);
    expect(r.results[1]!.row).toEqual({ sleeperId: '8183', name: 'Brock Purdy', position: 'QB', team: 'SF', value: 6500 });
  });

  it('requires the Sleeper ID and value columns', () => {
    const r = buildCsvRows(parsed.rows, { name: 0, value: 4 });
    expect(r.blocking).toEqual(['Choose which column holds the Sleeper ID.']);
  });

  it('flags messy rows individually: empty values, text values, negatives, missing IDs, duplicates', () => {
    const messy = parseCsv(
      [
        'name,sleeper_id,value,rank',
        'Good,100,50,1',
        'Empty value,101,,2',
        'Text value,102,lots,3',
        'Negative,103,-4,4',
        'No id,,40,5',
        'Dup one,104,30,6',
        'Dup two,104,20,7',
        'Bad rank,105,10,first',
        'Gardner Minshew II,106,5,8',
      ].join('\n'),
    );
    if (!messy.ok) throw new Error(messy.error);
    const r = buildCsvRows(messy.rows, guessMapping(messy.header));
    expect(r.results.map((x) => x.error)).toEqual([
      null,
      'Missing value',
      'Value "lots" isn\'t a number',
      'Value is negative',
      'Missing Sleeper ID',
      'Duplicate Sleeper ID (lines 7, 8)',
      'Duplicate Sleeper ID (lines 7, 8)',
      'Rank "first" isn\'t a number',
      null,
    ]);
    expect(r.validCount).toBe(2);
    expect(r.invalidCount).toBe(7);
    expect(r.results[8]!.row!.name).toBe('Gardner Minshew II'); // suffixes are kept as-is; matching uses the ID
  });

  it('blocks a wrong-format file (e.g. a sales report) with no usable rows', () => {
    const wrong = parseCsv('Order,Customer,Total\n1001,Smith,25.00\n1002,Jones,30.00\n');
    if (!wrong.ok) throw new Error();
    expect(buildCsvRows(wrong.rows, guessMapping(wrong.header)).blocking).toEqual([
      'Choose which column holds the Sleeper ID.',
      'Choose which column holds the Value.',
    ]);
    const forced = buildCsvRows(wrong.rows, { sleeperId: 1, value: 0 });
    expect(forced.validCount).toBe(2); // mapped by hand, it "works" — which is why the preview shows names/values before saving
    const nonsense = buildCsvRows(wrong.rows, { sleeperId: 0, value: 1 });
    expect(nonsense.blocking).toContain('No usable rows. Check that the right columns are chosen and this is a valuation file.');
  });

  it('rejects choosing one column for two fields', () => {
    expect(buildCsvRows(parsed.rows, { sleeperId: 1, value: 1 }).blocking).toContain('The same column is chosen for two different fields.');
  });
});

describe('CSV set storage', () => {
  const set = (id: string, isDynasty = true, numQbs: 1 | 2 = 2): CsvSet => ({
    id,
    name: id,
    source: 'test',
    exportDate: '2026-10-20',
    importedAt: '2026-10-21T00:00:00Z',
    isDynasty,
    numQbs,
    rows: [],
    skippedRows: 0,
  });

  it('keeps latest and previous per format, and never mixes formats', async () => {
    const store = memoryStore();
    await saveCsvSet(store, set('a'));
    await saveCsvSet(store, set('b'));
    await saveCsvSet(store, set('c'));
    await saveCsvSet(store, set('r', false, 1));
    const lib = await loadCsvLibrary(store);
    expect(lib['dynasty-2qb']).toMatchObject({ latest: { id: 'c' }, previous: { id: 'b' } });
    expect(lib['redraft-1qb']).toMatchObject({ latest: { id: 'r' }, previous: null });
    expect(Object.keys(lib).sort()).toEqual(['dynasty-2qb', 'redraft-1qb']);
  });
});
