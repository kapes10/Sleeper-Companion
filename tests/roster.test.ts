import { describe, expect, it } from 'vitest';
import { toPlayerIndex } from '../src/domain/players';
import { buildRosterView, findOwnerRoster, teamName } from '../src/domain/roster';
import { clone, fx, OWNER_ID } from './helpers';

const players = toPlayerIndex(fx.players);

describe('owner-to-roster mapping', () => {
  it("finds the owner's roster by stable user ID", () => {
    const r1 = findOwnerRoster(fx.league01Rosters, OWNER_ID);
    expect(r1).toMatchObject({ kind: 'found', role: 'owner', roster: { roster_id: 4 } });
    const r2 = findOwnerRoster(fx.league02Rosters, OWNER_ID);
    expect(r2).toMatchObject({ kind: 'found', role: 'owner', roster: { roster_id: 3 } });
  });

  it('never attributes another roster when the user is absent', () => {
    expect(findOwnerRoster(fx.league01Rosters, '999999999999999999')).toEqual({ kind: 'not_found' });
    expect(findOwnerRoster([], OWNER_ID)).toEqual({ kind: 'not_found' });
  });

  it('recognises co-ownership', () => {
    const rosters = clone(fx.league01Rosters).map((r) => (r.owner_id === OWNER_ID ? { ...r, owner_id: 'someone-else' } : r));
    rosters[0]!.co_owners = [OWNER_ID];
    expect(findOwnerRoster(rosters, OWNER_ID)).toMatchObject({ kind: 'found', role: 'co-owner', roster: { roster_id: rosters[0]!.roster_id } });
  });

  it('reports ambiguity rather than picking one roster', () => {
    const rosters = clone(fx.league01Rosters);
    const other = rosters.find((r) => r.owner_id !== OWNER_ID)!;
    other.co_owners = [OWNER_ID];
    expect(findOwnerRoster(rosters, OWNER_ID)).toEqual({ kind: 'ambiguous', rosterIds: [4, other.roster_id] });
  });

  it('handles rosters without an owner (orphaned teams)', () => {
    const rosters = clone(fx.league01Rosters).map((r) => ({ ...r, owner_id: null }));
    expect(findOwnerRoster(rosters, OWNER_ID)).toEqual({ kind: 'not_found' });
  });

  it('uses the team name, falling back to display name', () => {
    expect(teamName(fx.league02Users, OWNER_ID)).toBe('Fixture Owner');
    const named = fx.league02Users.find((u) => u.metadata?.team_name);
    if (named) expect(teamName(fx.league02Users, named.user_id)).toBe(named.metadata!.team_name);
    expect(teamName(fx.league02Users, 'nobody')).toBeNull();
  });
});

describe('roster-to-player mapping', () => {
  it('labels starters by lineup slot with correct player names, including empty slots', () => {
    const { roster } = findOwnerRoster(fx.league01Rosters, OWNER_ID) as { roster: (typeof fx.league01Rosters)[number] };
    const view = buildRosterView(roster, fx.league01.roster_positions, players);
    expect(view.starters.map((s) => [s.slot, s.player?.name ?? null])).toEqual([
      ['QB', 'Jalen Hurts'],
      ['RB', null],
      ['RB', 'Cam Skattebo'],
      ['WR', "Ja'Marr Chase"],
      ['WR', 'Marvin Harrison Jr.'],
      ['WR', 'Makai Lemon'],
      ['TE', 'Sam LaPorta'],
      ['FLEX', null],
      ['FLEX', 'Zach Charbonnet'],
      ['FLEX', 'Emmett Johnson'],
      ['FLEX', 'Eli Stowers'],
      ['SF', 'Brock Purdy'],
    ]);
    expect(view.starters[0]!.player).toMatchObject({ position: 'QB', team: 'PHI' });
    expect(view.bench).toHaveLength(18);
    expect(view.reserve).toEqual([]);
    expect(view.taxi).toEqual([]);
    expect(view.unknownPlayerIds).toEqual([]);
  });

  it('separates bench, IR and taxi without double-counting', () => {
    const { roster } = findOwnerRoster(fx.league02Rosters, OWNER_ID) as { roster: (typeof fx.league02Rosters)[number] };
    const view = buildRosterView(roster, fx.league02.roster_positions, players);
    expect(view.starters.map((s) => s.player?.name)).toEqual([
      'Kirk Cousins',
      'Javonte Williams',
      'Rhamondre Stevenson',
      'Tee Higgins',
      'Matthew Golden',
      "Ja'Marr Chase",
      'Harold Fannin Jr.',
      'Dalton Schultz',
      'J.K. Dobbins',
      'Brock Purdy',
    ]);
    expect(view.reserve.map((p) => p.playerId)).toEqual(['2133', '4033', '4950', '7543']);
    expect(view.taxi.map((p) => p.playerId)).toEqual(['12511']);
    expect(view.bench).toHaveLength(10);
    const all = [...view.starters.map((s) => s.player!.playerId), ...view.bench, ...view.reserve, ...view.taxi].map((p) =>
      typeof p === 'string' ? p : p.playerId,
    );
    expect(new Set(all).size).toBe(roster.players!.length);
  });

  it('shows a clear placeholder for player IDs missing from the player list', () => {
    const roster = clone(findOwnerRoster(fx.league02Rosters, OWNER_ID) as { roster: (typeof fx.league02Rosters)[number] }).roster;
    roster.players = [...roster.players!, '99999999'];
    const view = buildRosterView(roster, fx.league02.roster_positions, players);
    expect(view.unknownPlayerIds).toEqual(['99999999']);
    expect(view.bench.at(-1)).toMatchObject({ name: 'Unknown player (ID 99999999)', unknown: true });
  });

  it('copes with null starters/players (empty roster)', () => {
    const roster = { ...fx.league02Rosters[0]!, starters: null, players: null, reserve: null, taxi: null };
    const view = buildRosterView(roster, fx.league02.roster_positions, players);
    expect(view.starters.every((s) => s.player === null)).toBe(true);
    expect(view.bench).toEqual([]);
  });

  it('names team defenses, which have no full_name', () => {
    expect(players.PHI!.name).toBe('Philadelphia Eagles');
  });
});
