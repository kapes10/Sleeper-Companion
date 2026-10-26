// Shared data loading for the Team Analyzer and the Trade partners view (same data, same caches).
import type { SleeperLeague, SleeperLeagueUser, SleeperRoster, SleeperTradedPick, SleeperTransaction } from '../../api/types';
import { analyzeLeague, type LeagueAnalysis } from '../../analysis/tiers';
import { analyzePositions, type LeaguePositional } from '../../analysis/positional/positional';
import type { PlayerIndex } from '../../domain/players';
import type { Services } from '../../services';
import type { FcSnapshot } from '../../valuations/fantasycalc/load';
import { selectFcSet, type FcSelection } from '../../valuations/leagueValues';
import { matchValues, type PlayerValue } from '../../valuations/match';

/** Weeks of transactions fetched for "recent trades" (the current week and the two before it). */
export const RECENT_WEEKS = 3;

export interface AnalyzerData {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  players: PlayerIndex;
  tradedPicks: SleeperTradedPick[];
  analysis: LeagueAnalysis;
  /** NFL week from Sleeper's /state/nfl. */
  week: number;
  fetchedAt: number;
}

export async function loadAnalyzerData(services: Services, leagueId: string, force: boolean): Promise<AnalyzerData> {
  const c = <T,>(key: string, fn: () => Promise<T>) => services.cached(key, fn, force);
  const nfl = await c('state:nfl', () => services.api.getNflState());
  const week = nfl.data.week;
  const weeks = Array.from({ length: RECENT_WEEKS }, (_, i) => week - i).filter((w) => w >= 1);
  const [league, rosters, users, picks, players, ...tx] = await Promise.all([
    c(`league:${leagueId}`, () => services.api.getLeague(leagueId)),
    c(`rosters:${leagueId}`, () => services.api.getRosters(leagueId)),
    c(`users:${leagueId}`, () => services.api.getLeagueUsers(leagueId)),
    c(`traded-picks:${leagueId}`, () => services.api.getTradedPicks(leagueId)),
    services.players(),
    ...weeks.map((w) => c(`transactions:${leagueId}:${w}`, () => services.api.getTransactions(leagueId, w))),
  ]);
  if (!league.data) throw new Error('Sleeper has no league with this ID.');
  const analysis = analyzeLeague({
    league: league.data,
    rosters: rosters.data,
    tradedPicks: picks.data,
    recentTransactions: tx.flatMap((t) => t.data as SleeperTransaction[]),
    players: players.players,
    currentWeek: week,
  });
  return { league: league.data, rosters: rosters.data, users: users.data, players: players.players, tradedPicks: picks.data, analysis, week, fetchedAt: rosters.fetchedAt };
}

export type LeagueValues =
  | { kind: 'available'; sel: Extract<FcSelection, { kind: 'available' }>; snap: FcSnapshot; values: Map<string, PlayerValue>; positional: LeaguePositional }
  /** No FantasyCalc snapshot for this league's format, or the format can't be mapped. */
  | { kind: 'missing' | 'unsupported'; positional: LeaguePositional };

/** The league's FantasyCalc snapshot, matched values and Stage 4 positional analysis. */
export async function loadLeagueValues(services: Services, data: AnalyzerData, force: boolean): Promise<LeagueValues> {
  const { data: index } = await services.fcIndex(force);
  const sel = selectFcSet(data.league, index);
  const base = { league: data.league, rosters: data.rosters, players: data.players };
  if (sel.kind !== 'available') {
    const why = sel.kind === 'missing' ? "No FantasyCalc values have been published for this league's format yet." : "This league's settings can't be matched to FantasyCalc values.";
    return { kind: sel.kind, positional: analyzePositions({ ...base, values: null, valuesMissingReason: why }) };
  }
  const snap = await services.fcSnapshot(sel.state.latest!);
  const values = matchValues(snap.rows, data.players).bySleeperId;
  return { kind: 'available', sel, snap, values, positional: analyzePositions({ ...base, values }) };
}
