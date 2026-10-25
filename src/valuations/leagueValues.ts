// Chooses the valuation set for a league from its real Sleeper settings. Pure functions.
import type { SleeperLeague } from '../api/types';
import { mapLeagueToFcParams, type FcParams } from './fantasycalc/params.ts';
import type { SetState, ValuesIndex } from './fantasycalc/refresh.ts';
import { csvFormatKey, type CsvLibrary, type CsvSet } from './csv/store';

export type FcSelection =
  | { kind: 'available'; key: string; params: FcParams; state: SetState; notes: string[] }
  /** The league maps fine but nothing has been published for its parameter set yet. */
  | { kind: 'missing'; key: string; params: FcParams; state: SetState | undefined; notes: string[] }
  /** The league's settings can't be expressed as FantasyCalc parameters. */
  | { kind: 'unsupported'; reasons: string[]; notes: string[] };

export function selectFcSet(league: SleeperLeague, index: ValuesIndex | null): FcSelection {
  const m = mapLeagueToFcParams(league);
  if (!m.ok) return { kind: 'unsupported', reasons: m.reasons, notes: m.notes };
  const state = index?.sets[m.key];
  if (state?.latest) return { kind: 'available', key: m.key, params: m.params, state, notes: m.notes };
  return { kind: 'missing', key: m.key, params: m.params, state, notes: m.notes };
}

/** Manual CSV sets carry only dynasty/redraft and QB count, so those are what must match. */
export function selectCsvSet(league: SleeperLeague, library: CsvLibrary): CsvSet | null {
  const m = mapLeagueToFcParams(league);
  const type = league.settings?.type;
  if (type !== 0 && type !== 2) return null;
  const numQbs: 1 | 2 = m.ok ? m.params.numQbs : league.roster_positions?.includes('SUPER_FLEX') ? 2 : 1;
  return library[csvFormatKey(type === 2, numQbs)]?.latest ?? null;
}
