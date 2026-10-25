// The documented Sleeper endpoints this app uses. All are public and read-only.
import type { SleeperClient } from './client';
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperNflState,
  SleeperPlayerMap,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
  SleeperUser,
} from './types';

/** Trims whitespace and a leading "@" (Sleeper returns null for "@name"). */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, '').trim();
}

export class UserNotFoundError extends Error {
  constructor(username: string) {
    super(`No Sleeper account found for "${username}". Check the spelling and try again.`);
    this.name = 'UserNotFoundError';
  }
}

export function createSleeperApi(client: SleeperClient) {
  return {
    /** GET /user/<username>. Sleeper answers an unknown username with `null`. */
    async getUser(rawUsername: string): Promise<SleeperUser> {
      const username = normalizeUsername(rawUsername);
      if (!username) throw new UserNotFoundError(rawUsername);
      const user = await client.getJson<SleeperUser | null>(`/user/${encodeURIComponent(username)}`);
      if (!user || !user.user_id) throw new UserNotFoundError(username);
      return user;
    },

    /** GET /state/nfl — current season and week. */
    getNflState: () => client.getJson<SleeperNflState>('/state/nfl'),

    /** GET /user/<user_id>/leagues/nfl/<season> */
    async getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
      const leagues = await client.getJson<SleeperLeague[] | null>(
        `/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`,
      );
      return leagues ?? [];
    },

    /** GET /league/<league_id> */
    getLeague: (leagueId: string) => client.getJson<SleeperLeague | null>(`/league/${encodeURIComponent(leagueId)}`),

    /** GET /league/<league_id>/rosters */
    async getRosters(leagueId: string): Promise<SleeperRoster[]> {
      return (await client.getJson<SleeperRoster[] | null>(`/league/${encodeURIComponent(leagueId)}/rosters`)) ?? [];
    },

    /** GET /league/<league_id>/users */
    async getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
      return (await client.getJson<SleeperLeagueUser[] | null>(`/league/${encodeURIComponent(leagueId)}/users`)) ?? [];
    },

    /** GET /league/<league_id>/traded_picks — every traded pick, including future seasons. */
    async getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
      return (await client.getJson<SleeperTradedPick[] | null>(`/league/${encodeURIComponent(leagueId)}/traded_picks`)) ?? [];
    },

    /** GET /league/<league_id>/transactions/<week> */
    async getTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
      return (await client.getJson<SleeperTransaction[] | null>(`/league/${encodeURIComponent(leagueId)}/transactions/${week}`)) ?? [];
    },

    /** GET /players/nfl — large (~5 MB compressed); Sleeper asks for at most one call per day. */
    getAllPlayers: () => client.getJson<SleeperPlayerMap>('/players/nfl'),
  };
}

export type SleeperApi = ReturnType<typeof createSleeperApi>;
