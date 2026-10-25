import { describe, expect, it } from 'vitest';
import { receptionLabel, summarizeLeague } from '../src/domain/league';
import { clone, fx } from './helpers';

describe('league parsing (real, redacted league settings)', () => {
  it('summarises a best-ball dynasty superflex league', () => {
    const s = summarizeLeague(fx.league01);
    expect(s.format).toBe('Dynasty · Best Ball · Superflex');
    expect(s.scoring).toBe('PPR · TE +1.0/rec · 6pt pass TD');
    expect(s.starterSlots).toBe(12);
    expect(s.benchSlots).toBe(17);
    expect(s.rosterSize).toBe(29);
    expect(s.isBestBall).toBe(true);
    expect(s.teams).toBe(12);
    expect(s.unsupported).toEqual([]);
  });

  it('summarises a standard-lineup dynasty league with IR and taxi', () => {
    const s = summarizeLeague(fx.league02);
    expect(s.format).toBe('Dynasty · Superflex');
    expect(s.scoring).toBe('PPR · TE +0.5/rec · 6pt pass TD');
    expect(s.starterSlots).toBe(10);
    expect(s.benchSlots).toBe(14);
    expect(s.rosterSize).toBe(24);
    expect(s.reserveSlots).toBe(4);
    expect(s.taxiSlots).toBe(4);
    expect(s.isBestBall).toBe(false);
  });

  it('parses every league on the account without flagging unsupported settings', () => {
    const all = fx.userLeagues.map(summarizeLeague);
    expect(all).toHaveLength(23);
    for (const s of all) {
      expect(s.name).toBeTruthy();
      expect(s.rosterSize).toBeGreaterThan(0);
      expect(s.unsupported).toEqual([]);
    }
  });

  it('flags IDP slots and unknown league types instead of guessing', () => {
    const league = clone(fx.league02);
    league.roster_positions = [...league.roster_positions, 'DL', 'LB'];
    league.settings.type = 7;
    expect(summarizeLeague(league).unsupported).toEqual(['IDP lineup slots', 'Unknown league type']);
  });

  it('labels reception scoring', () => {
    expect(receptionLabel(1)).toBe('PPR');
    expect(receptionLabel(0.5)).toBe('Half PPR');
    expect(receptionLabel(0)).toBe('Standard (no PPR)');
    expect(receptionLabel(undefined)).toBe('Standard (no PPR)');
    expect(receptionLabel(0.25)).toBe('0.25 pts/rec');
  });
});
