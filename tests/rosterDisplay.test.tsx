// Roster display rules (owner approved 2026-10-29): best-ball gap fill by market value, and
// bench/IR/taxi grouped by position, highest value first. Fixtures are REDACTED real data;
// league_01 is a best-ball league whose owner roster has two empty lineup slots (RB and FLEX).
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/App';
import { createServices, ServicesProvider } from '../src/services';
import { memoryStore } from '../src/storage/idb';
import { saveAccount } from '../src/storage/prefs';
import { saveLeagueTypes } from '../src/storage/lineup';
import { fillEmptySlots, groupByPosition } from '../src/analysis/rosterDisplay';
import { buildRosterView } from '../src/domain/roster';
import { toPlayerIndex } from '../src/domain/players';
import type { PlayerValue } from '../src/valuations/match';
import { clone, fixtureFetch, fx, LEAGUE_01_ID, LEAGUE_02_ID, OWNER_ID, publishedValues, valuesFetch } from './helpers';

const players = toPlayerIndex(fx.players);
const id = (name: string) => Object.values(players).find((p) => p.name === name)!.id;
const mine = (rs: typeof fx.league01Rosters) => rs.find((r) => r.owner_id === OWNER_ID)!;
/** Made-up values for logic tests only (never shown in the app). */
const values = (byName: Record<string, number>) => {
  const m = new Map<string, PlayerValue>(Object.entries(byName).map(([n, raw]) => [id(n), { raw, scaled: raw / 100 } as PlayerValue]));
  return (pid: string) => m.get(pid) ?? null;
};

describe('best-ball gap fill (logic)', () => {
  const roster = mine(clone(fx.league01Rosters));
  const positions = fx.league01.roster_positions;

  it('fills each empty slot, in Sleeper order, with the highest-value eligible bench player not already used', () => {
    const v = values({ 'Drake London': 5000, 'Kendre Miller': 900, 'Emanuel Wilson': 1200, 'Ty Simpson': 9000 });
    const fills = fillEmptySlots(roster, positions, players, v);
    expect(fills.map((f) => [f.slot, f.playerId && players[f.playerId]!.name])).toEqual([
      ['RB', 'Emanuel Wilson'], // RB slot: RBs only (Ty Simpson is a QB, Drake London a WR)
      ['FLEX', 'Drake London'], // FLEX: RB/WR/TE, highest value
    ]);
    expect(fills[0]!.reason).toMatch(/Empty in Sleeper\. Shown: the eligible bench player with the highest market value \(not projected points\)\. Nothing is changed in Sleeper\./);
  });

  it('never uses players without a value, or reserve/taxi players; leaves the slot empty with a reason', () => {
    const fills = fillEmptySlots(roster, positions, players, values({}));
    expect(fills.every((f) => f.playerId === null)).toBe(true);
    expect(fills[0]!.reason).toBe('Empty in Sleeper. No bench player with a market value can fill this slot.');
  });

  it('never fills an unsupported slot type (never treated as FLEX)', () => {
    const p = [...positions];
    p[p.indexOf('FLEX')] = 'REC_FLEX';
    const fills = fillEmptySlots(roster, p, players, values({ 'Drake London': 5000 }));
    expect(fills.find((f) => f.slot === 'REC_FLEX')).toMatchObject({ playerId: null, reason: expect.stringMatching(/doesn't support/) });
  });

  it('a full lineup needs no fill', () => {
    expect(fillEmptySlots(mine(clone(fx.league02Rosters)), fx.league02.roster_positions, players, values({}))).toEqual([]);
  });
});

describe('grouped by position, highest value first (logic)', () => {
  it('orders QB, RB, WR, TE, then others; value descending; no value last by name', () => {
    const view = buildRosterView(mine(clone(fx.league01Rosters)), fx.league01.roster_positions, players);
    const v = values({ 'Kendre Miller': 900, 'Emanuel Wilson': 1200, 'Drake London': 5000, 'Ricky Pearsall': 4000 });
    const g = groupByPosition(view.bench, v);
    expect(g.map((x) => x.position)).toEqual(['QB', 'RB', 'WR', 'TE']);
    const rb = g.find((x) => x.position === 'RB')!.players.map((p) => p.name);
    expect(rb.slice(0, 2)).toEqual(['Emanuel Wilson', 'Kendre Miller']);
    expect(rb.slice(2)).toEqual([...rb.slice(2)].sort((a, b) => a.localeCompare(b)));
    expect(g.find((x) => x.position === 'WR')!.players.slice(0, 2).map((p) => p.name)).toEqual(['Drake London', 'Ricky Pearsall']);
  });

  it('without values, groups still apply and players are alphabetical', () => {
    const view = buildRosterView(mine(clone(fx.league01Rosters)), fx.league01.roster_positions, players);
    const wr = groupByPosition(view.bench, null).find((x) => x.position === 'WR')!.players.map((p) => p.name);
    expect(wr).toEqual([...wr].sort((a, b) => a.localeCompare(b)));
  });
});

describe('roster screen', () => {
  beforeEach(() => localStorage.clear());
  async function renderRoster(hash: string) {
    saveAccount({ username: 'fixture_owner', userId: OWNER_ID, displayName: 'Fixture Owner' });
    location.hash = hash;
    const services = createServices({
      client: { fetchImpl: fixtureFetch().impl, backoffMs: 0 },
      store: memoryStore(),
      now: () => Date.parse('2026-10-25T03:00:00.000Z'),
      valuesFetch: valuesFetch(await publishedValues()),
    });
    render(
      <ServicesProvider services={services}>
        <App />
      </ServicesProvider>,
    );
  }

  it('in a league you marked Best ball, empty slots show the highest-value eligible bench player, clearly labeled', async () => {
    saveLeagueTypes({ [LEAGUE_01_ID]: 'bestball' });
    await renderRoster(`#/league/${LEAGUE_01_ID}`);
    const starters = await screen.findByRole('region', { name: 'Starters' });
    await waitFor(() => expect(within(starters).getAllByTestId('filled-slot')).toHaveLength(2));
    expect(within(starters).queryByText('Empty')).toBeNull();
    for (const row of within(starters).getAllByTestId('filled-slot')) expect(row).toHaveTextContent(/highest market value \(not projected points\)\. Nothing is changed in Sleeper\./);
    expect(screen.getByText(/2 empty lineup slots are shown filled/)).toHaveTextContent('Sleeper still has them empty');
    // A filled player isn't also listed on the bench.
    const filledNames = within(starters).getAllByTestId('filled-slot').map((r) => r.querySelector('p')!.textContent!);
    const bench = screen.getByRole('region', { name: 'Bench' });
    for (const n of filledNames) expect(within(bench).queryByText(n)).toBeNull();
  });

  it('in a league not marked Best ball, empty slots stay empty and the app explains how to turn the fill on', async () => {
    await renderRoster(`#/league/${LEAGUE_01_ID}`);
    const starters = await screen.findByRole('region', { name: 'Starters' });
    expect(within(starters).getAllByText('Empty')).toHaveLength(2);
    expect(await screen.findByText(/mark this league as Best ball under/)).toBeInTheDocument();
  });

  it('bench, IR and taxi are grouped by position', async () => {
    await renderRoster(`#/league/${LEAGUE_02_ID}`);
    const bench = await screen.findByRole('region', { name: 'Bench' });
    const groups = within(bench).getAllByRole('group').map((g) => g.getAttribute('aria-label'));
    const order = ['QB group', 'RB group', 'WR group', 'TE group'];
    expect(groups.filter((g) => order.includes(g!))).toEqual(order.filter((o) => groups.includes(o)));
    expect(within(screen.getByRole('region', { name: 'Injured reserve' })).getAllByRole('group').length).toBeGreaterThan(0);
  });
});
