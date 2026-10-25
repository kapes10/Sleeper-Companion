// Turns parsed CSV rows into validated valuation rows using the owner's column mapping.
// Matching is by Sleeper ID only, so a Sleeper ID column is required.
import type { ValueRow } from '../match';

export type CsvField = 'sleeperId' | 'name' | 'position' | 'team' | 'value' | 'rank';
export type ColumnMapping = Partial<Record<CsvField, number>>;

export const CSV_FIELDS: { field: CsvField; label: string; required: boolean }[] = [
  { field: 'sleeperId', label: 'Sleeper ID', required: true },
  { field: 'value', label: 'Value', required: true },
  { field: 'name', label: 'Player name', required: false },
  { field: 'position', label: 'Position', required: false },
  { field: 'team', label: 'Team', required: false },
  { field: 'rank', label: 'Rank', required: false },
];

const GUESSES: Record<CsvField, RegExp> = {
  sleeperId: /^(sleeper[ _-]?(player[ _-]?)?id|sleeperid)$/i,
  value: /^(value|trade[ _-]?value|val)$/i,
  name: /^(player|name|player[ _-]?name|full[ _-]?name)$/i,
  position: /^(pos|position)$/i,
  team: /^(team|nfl[ _-]?team|tm)$/i,
  rank: /^(rank|overall[ _-]?rank|ovr|rk)$/i,
};

/** Pre-selects columns whose header obviously matches; the owner confirms or changes them. */
export function guessMapping(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const { field } of CSV_FIELDS) {
    const i = header.findIndex((h) => GUESSES[field].test(h.trim()));
    if (i >= 0) mapping[field] = i;
  }
  return mapping;
}

export interface CsvRowResult {
  line: number;
  row: ValueRow | null;
  rank: number | null;
  error: string | null;
}

export interface CsvBuildResult {
  /** Problems that block import entirely (e.g. required column not mapped). */
  blocking: string[];
  results: CsvRowResult[];
  validCount: number;
  invalidCount: number;
}

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, '').trim();
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function buildCsvRows(rows: { line: number; cells: string[] }[], mapping: ColumnMapping): CsvBuildResult {
  const blocking: string[] = [];
  for (const { field, label, required } of CSV_FIELDS) {
    if (required && mapping[field] === undefined) blocking.push(`Choose which column holds the ${label}.`);
  }
  const used = Object.values(mapping);
  if (new Set(used).size !== used.length) blocking.push('The same column is chosen for two different fields.');
  if (blocking.length) return { blocking, results: [], validCount: 0, invalidCount: 0 };

  const cell = (cells: string[], f: CsvField) => (mapping[f] === undefined ? '' : (cells[mapping[f]!] ?? ''));

  const results: CsvRowResult[] = rows.map(({ line, cells }) => {
    const sleeperId = cell(cells, 'sleeperId');
    const valueText = cell(cells, 'value');
    const rankText = cell(cells, 'rank');
    const name = cell(cells, 'name');
    let error: string | null = null;
    const value = parseNumber(valueText);
    if (!sleeperId) error = 'Missing Sleeper ID';
    else if (!valueText) error = 'Missing value';
    else if (value === null) error = `Value "${valueText}" isn't a number`;
    else if (value < 0) error = 'Value is negative';
    const rank = rankText ? parseNumber(rankText) : null;
    if (!error && rankText && rank === null) error = `Rank "${rankText}" isn't a number`;
    if (error) return { line, row: null, rank: null, error };
    return {
      line,
      rank,
      error: null,
      row: { sleeperId, name: name || `Sleeper ID ${sleeperId}`, position: cell(cells, 'position') || null, team: cell(cells, 'team') || null, value: value! },
    };
  });

  // Duplicate Sleeper IDs: never pick one; reject every copy.
  const lines = new Map<string, number[]>();
  for (const r of results) if (r.row?.sleeperId) lines.set(r.row.sleeperId, [...(lines.get(r.row.sleeperId) ?? []), r.line]);
  for (const r of results) {
    const dup = r.row?.sleeperId ? lines.get(r.row.sleeperId)! : [];
    if (dup.length > 1) {
      r.error = `Duplicate Sleeper ID (lines ${dup.join(', ')})`;
      r.row = null;
    }
  }

  const validCount = results.filter((r) => r.row).length;
  if (validCount === 0) blocking.push('No usable rows. Check that the right columns are chosen and this is a valuation file.');
  return { blocking, results, validCount, invalidCount: results.length - validCount };
}
