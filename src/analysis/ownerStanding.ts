// The owner's place in a league for the league list: record and standings place, points for and
// its rank, and the league's highest points for. Uses the same standings order as the Team
// Analyzer (win %, then points for; Sleeper's real tiebreakers aren't published).
import type { SleeperRoster } from '../api/types';
import { findOwnerRoster } from '../domain/roster';
import { buildStandings, formatRecord } from './standings';

export type OwnerStanding =
  | {
      kind: 'ok';
      record: string;
      /** 1 = first place. */
      place: number;
      teams: number;
      pointsFor: number;
      /** 1 = most points for. */
      pointsForRank: number;
      leagueHighPointsFor: number;
      /** True when the owner has the league's highest points for. */
      ownerHasHigh: boolean;
      gamesPlayed: number;
    }
  | { kind: 'not_found' | 'ambiguous' };

export function ownerStanding(rosters: SleeperRoster[], userId: string): OwnerStanding {
  const mine = findOwnerRoster(rosters, userId);
  if (mine.kind !== 'found') return { kind: mine.kind };
  const standings = buildStandings(rosters);
  const me = standings.find((t) => t.rosterId === mine.roster.roster_id)!;
  const high = Math.max(...standings.map((t) => t.pf));
  return {
    kind: 'ok',
    record: formatRecord(me),
    place: me.rank,
    teams: standings.length,
    pointsFor: me.pf,
    pointsForRank: me.pfRank,
    leagueHighPointsFor: high,
    ownerHasHigh: me.pf === high,
    gamesPlayed: me.games,
  };
}
