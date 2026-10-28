// Data loading for the lineup manager. Uses the same cache keys as the other screens, so a normal
// load can reuse data up to 5 minutes old; the review screen and "Check again" always force a
// fresh read (never cached data reported as a fresh check).
import type { SleeperLeague, SleeperNflState, SleeperRoster } from '../../api/types';
import type { PlayerIndex } from '../../domain/players';
import type { Services } from '../../services';
import type { SavedAccount } from '../../storage/prefs';

export interface LineupContext {
  state: SleeperNflState;
  /** Raw league objects (slot layout, status, best_ball hint). */
  leagues: SleeperLeague[];
  players: PlayerIndex;
  playersFetchedAt: number;
}

async function stateAndLeagues(services: Services, account: SavedAccount, force: boolean) {
  const opts = force ? { fresh: true } : undefined;
  const state = await services.cached('state:nfl', () => services.api.getNflState(opts), force);
  const season = state.data.league_season || state.data.season;
  const leagues = await services.cached(`leagues:${account.userId}:${season}`, () => services.api.getUserLeagues(account.userId, season, opts), force);
  return { state: state.data, leagues: leagues.data, leaguesReceivedAt: leagues.fetchedAt };
}

/** NFL state, the owner's leagues and the cached player list (normal reads). */
export async function loadLineupContext(services: Services, account: SavedAccount, force = false): Promise<LineupContext> {
  const [base, players] = await Promise.all([stateAndLeagues(services, account, force), services.players()]);
  return { state: base.state, leagues: base.leagues, players: players.players, playersFetchedAt: players.fetchedAt };
}

export type RosterRead = { ok: true; rosters: SleeperRoster[]; receivedAt: number } | { ok: false; error: unknown };

/** One league's rosters; `force` = a fresh read (bypasses the 5-minute reuse and the browser's copy). */
export async function readRosters(services: Services, leagueId: string, force: boolean): Promise<RosterRead> {
  try {
    const r = await services.cached(`rosters:${leagueId}`, () => services.api.getRosters(leagueId, force ? { fresh: true } : undefined), force);
    return { ok: true, rosters: r.data, receivedAt: r.fetchedAt };
  } catch (error) {
    return { ok: false, error };
  }
}

export type FreshReadResult =
  | { ok: true; state: SleeperNflState; leagues: SleeperLeague[]; rosters: Map<string, RosterRead> }
  /** The shared NFL state or league list couldn't be read, so no league could be checked. */
  | { ok: false; error: unknown };

/**
 * A forced read for some leagues: NFL state (1 request), the league list (1 request) and one
 * roster request per league. Nothing else.
 */
export async function freshRead(services: Services, account: SavedAccount, leagueIds: string[]): Promise<FreshReadResult> {
  let base;
  try {
    base = await stateAndLeagues(services, account, true);
  } catch (error) {
    return { ok: false, error };
  }
  const results = await Promise.all(leagueIds.map(async (id) => [id, await readRosters(services, id, true)] as const));
  return { ok: true, state: base.state, leagues: base.leagues, rosters: new Map(results) };
}

/** Conservative league-level link (the format tested on desktop; not documented by Sleeper). */
export const sleeperLeagueUrl = (leagueId: string) => `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}`;
