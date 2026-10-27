import { describe, expect, it } from 'vitest';
import { ownerStanding } from '../src/analysis/ownerStanding';
import { AZ_OWNER, azLeague } from './analyzerHelpers';

describe("owner's standing for the league list (real redacted leagues)", () => {
  it('league A: record, place, points for, its rank, and the league high', () => {
    expect(ownerStanding(azLeague('A').rosters, AZ_OWNER)).toEqual({
      kind: 'ok',
      record: '4-2',
      place: 4,
      teams: 12,
      pointsFor: 949.44,
      pointsForRank: 4,
      leagueHighPointsFor: 987.98,
      ownerHasHigh: false,
      gamesPlayed: 6,
    });
  });

  it('league C (median games): 12-0, first place, 2nd in points', () => {
    expect(ownerStanding(azLeague('C').rosters, AZ_OWNER)).toMatchObject({ record: '12-0', place: 1, pointsForRank: 2, teams: 12 });
  });

  it('league D: 10 teams', () => {
    expect(ownerStanding(azLeague('D').rosters, AZ_OWNER)).toMatchObject({ record: '4-2', place: 3, teams: 10, pointsForRank: 2 });
  });

  it('flags when the owner has the league high', () => {
    const rosters = structuredClone(azLeague('A').rosters);
    const me = rosters.find((r) => r.owner_id === AZ_OWNER)!;
    me.settings = { ...me.settings, fpts: 2000, fpts_decimal: 0 };
    expect(ownerStanding(rosters, AZ_OWNER)).toMatchObject({ pointsFor: 2000, pointsForRank: 1, leagueHighPointsFor: 2000, ownerHasHigh: true });
  });

  it('shows ties as a record with ties, and handles no games yet', () => {
    const rosters = structuredClone(azLeague('A').rosters);
    const me = rosters.find((r) => r.owner_id === AZ_OWNER)!;
    me.settings = { ...me.settings, wins: 3, losses: 2, ties: 1 };
    expect(ownerStanding(rosters, AZ_OWNER)).toMatchObject({ record: '3-2-1' });
    const fresh = structuredClone(azLeague('A').rosters).map((r) => ({ ...r, settings: { wins: 0, losses: 0, ties: 0, fpts: 0 } }));
    expect(ownerStanding(fresh, AZ_OWNER)).toMatchObject({ record: '0-0', gamesPlayed: 0 });
  });

  it('never guesses which team is yours', () => {
    expect(ownerStanding(azLeague('A').rosters, 'someone-else')).toEqual({ kind: 'not_found' });
    const two = structuredClone(azLeague('A').rosters);
    two.find((r) => r.owner_id !== AZ_OWNER)!.co_owners = [AZ_OWNER];
    expect(ownerStanding(two, AZ_OWNER)).toEqual({ kind: 'ambiguous' });
  });
});
