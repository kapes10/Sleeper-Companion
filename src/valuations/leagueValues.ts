// Chooses the valuation set for a league from its real Sleeper settings. Pure functions.
import type { SleeperLeague } from '../api/types';
import { mapLeagueToFcParams, type FcParams } from './fantasycalc/params.ts';
import type { SetState, ValuesIndex } from './fantasycalc/refresh.ts';
import type { CsvLibrary, CsvSet } from './csv/store';

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

export type CsvSelection =
  /** A CSV set built for exactly this league's format. */
  | { kind: 'match'; set: CsvSet }
  /** CSV sets exist, but none for this league's format; listed so the app can say why they aren't used. */
  | { kind: 'mismatch'; others: CsvSet[] }
  | { kind: 'none' };

/**
 * A CSV set is used only when all five format settings match the league (dynasty/redraft,
 * QB count, teams, PPR, TE premium tier). Sets without recorded scoring never match.
 */
export function selectCsvSet(league: SleeperLeague, library: CsvLibrary): CsvSelection {
  const m = mapLeagueToFcParams(league);
  const match = m.ok ? library[m.key]?.latest : null;
  if (match?.params) return { kind: 'match', set: match };
  const others = Object.values(library).flatMap((slot) => (slot.latest ? [slot.latest] : []));
  return others.length ? { kind: 'mismatch', others } : { kind: 'none' };
}
