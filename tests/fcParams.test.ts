import { describe, expect, it } from 'vitest';
import { describeParams, mapLeagueToFcParams, paramKey, paramsQuery } from '../src/valuations/fantasycalc/params';
import { clone, fx } from './helpers';

describe('Sleeper league → FantasyCalc parameters', () => {
  it('maps every real league to one of the two expected parameter sets', () => {
    const keys = fx.userLeagues.map((l) => {
      const m = mapLeagueToFcParams(l);
      if (!m.ok) throw new Error(m.reasons.join(' '));
      return m.key;
    });
    expect(new Set(keys)).toEqual(new Set(['dynasty-2qb-12tm-ppr1-teplus', 'dynasty-2qb-10tm-ppr1-teplus']));
    expect(keys.filter((k) => k.includes('10tm'))).toHaveLength(1);
  });

  it('maps a best-ball league with TE +1.0 and lists what FantasyCalc does not model', () => {
    const m = mapLeagueToFcParams(fx.league01);
    expect(m).toMatchObject({ ok: true, params: { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 1, tep: 'te+' } });
    expect(m.notes.join('\n')).toMatch(/te\+ tier, which covers \+0.5 to \+1.0/);
    expect(m.notes.join('\n')).toMatch(/Best ball league/);
    expect(m.notes.join('\n')).toMatch(/Passing TDs are worth 6 pts/);
    expect(m.notes.join('\n')).toMatch(/Lineup size \(12 starters\)/);
  });

  it('maps a managed-lineup league with TE +0.5 to the same te+ tier', () => {
    const m = mapLeagueToFcParams(fx.league02);
    expect(m.ok && m.params.tep).toBe('te+');
    expect(m.notes.join('\n')).not.toMatch(/Best ball/);
  });

  it('builds the documented query string', () => {
    const m = mapLeagueToFcParams(fx.league02);
    if (!m.ok) throw new Error();
    expect(paramsQuery(m.params)).toBe('isDynasty=true&numQbs=2&numTeams=12&ppr=1&tep=te%2B');
    expect(describeParams(m.params)).toBe('Dynasty · Superflex/2QB · 12 teams · PPR 1 · TE+');
  });

  it('uses 1 QB when there is no superflex slot, and redraft for type 0', () => {
    const l = clone(fx.league02);
    l.roster_positions = l.roster_positions.filter((p) => p !== 'SUPER_FLEX');
    l.settings.type = 0;
    const m = mapLeagueToFcParams(l);
    expect(m.ok && m.params).toMatchObject({ isDynasty: false, numQbs: 1 });
  });

  it.each([
    ['team count', (l: typeof fx.league02) => (l.total_rosters = 16), /16-team league/],
    ['PPR value', (l: typeof fx.league02) => (l.scoring_settings.rec = 0.75), /0.75 points per reception/],
    ['keeper league', (l: typeof fx.league02) => (l.settings.type = 1), /Keeper league/],
    ['TE premium between tiers', (l: typeof fx.league02) => (l.scoring_settings.bonus_rec_te = 0.4), /falls between/],
  ])('flags an unsupported %s instead of rounding', (_, change, message) => {
    const l = clone(fx.league02);
    change(l);
    const m = mapLeagueToFcParams(l);
    expect(m.ok).toBe(false);
    expect(!m.ok && m.reasons.join(' ')).toMatch(message);
  });

  it('applies FantasyCalc tier boundaries for TE premium', () => {
    const tep = (bonus: number, teSlots = 1) => {
      const l = clone(fx.league02);
      l.scoring_settings.bonus_rec_te = bonus;
      l.roster_positions = [...l.roster_positions.filter((p) => p !== 'TE'), ...Array(teSlots).fill('TE')];
      const m = mapLeagueToFcParams(l);
      return m.ok ? m.params.tep : 'unsupported';
    };
    expect(tep(0)).toBe('none');
    expect(tep(0.25)).toBe('none');
    expect(tep(0.5)).toBe('te+');
    expect(tep(1)).toBe('te+');
    expect(tep(1.5)).toBe('te++');
    expect(tep(0, 2)).toBe('te++');
  });

  it('produces stable keys', () => {
    expect(paramKey({ isDynasty: false, numQbs: 1, numTeams: 10, ppr: 0.5, tep: 'none' })).toBe('redraft-1qb-10tm-ppr0.5-tenone');
  });
});
