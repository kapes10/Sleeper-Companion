// Standings from Sleeper roster records. Order: win percentage (a tie = half a win), then
// points for. Sleeper's real tiebreakers aren't published, so this order is an assumption.
import type { SleeperRoster } from '../api/types';

export interface TeamRecord {
  rosterId: number;
  ownerId: string | null;
  coOwners: string[];
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  games: number;
  /** wins + ties/2 */
  winEq: number;
  /** losses + ties/2 */
  lossEq: number;
  winPct: number;
  /** 1 = first place. */
  rank: number;
  /** 1 = most points for. */
  pfRank: number;
  /** False when Sleeper sent no record for this roster. */
  hasRecord: boolean;
}

const points = (whole?: number, hundredths?: number) => (whole ?? 0) + (hundredths ?? 0) / 100;

export function buildStandings(rosters: SleeperRoster[]): TeamRecord[] {
  const teams = rosters.map((r): TeamRecord => {
    const s = r.settings;
    const wins = s?.wins ?? 0;
    const losses = s?.losses ?? 0;
    const ties = s?.ties ?? 0;
    const games = wins + losses + ties;
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id ?? null,
      coOwners: r.co_owners ?? [],
      wins,
      losses,
      ties,
      pf: points(s?.fpts, s?.fpts_decimal),
      pa: points(s?.fpts_against, s?.fpts_against_decimal),
      games,
      winEq: wins + ties / 2,
      lossEq: losses + ties / 2,
      winPct: games ? (wins + ties / 2) / games : 0,
      rank: 0,
      pfRank: 0,
      hasRecord: !!s && typeof s.wins === 'number',
    };
  });
  teams.sort((a, b) => b.winPct - a.winPct || b.pf - a.pf || a.rosterId - b.rosterId);
  teams.forEach((t, i) => (t.rank = i + 1));
  [...teams].sort((a, b) => b.pf - a.pf || a.rosterId - b.rosterId).forEach((t, i) => (t.pfRank = i + 1));
  return teams;
}

/** How many games `team` trails `leader` (negative = team is ahead). */
export function gamesBack(leader: TeamRecord, team: TeamRecord): number {
  return (leader.winEq - team.winEq + (team.lossEq - leader.lossEq)) / 2;
}

export function formatRecord(t: Pick<TeamRecord, 'wins' | 'losses' | 'ties'>): string {
  return t.ties ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`;
}
