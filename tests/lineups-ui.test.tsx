// Stage 6 lineup manager screens, driven with REDACTED real fixtures (leagues A–D) through the app.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/App';
import { createServices, ServicesProvider } from '../src/services';
import { memoryStore } from '../src/storage/idb';
import { saveAccount } from '../src/storage/prefs';
import { saveItems, saveLeagueTypes } from '../src/storage/lineup';
import { newItem } from '../src/analysis/lineup/verify';
import { AZ_OWNER, azLeague, azPlayers, azPlayersRaw, azState, type Letter } from './analyzerHelpers';
import { json } from './helpers';
import type { SleeperNflState, SleeperRoster } from '../src/api/types';

const LETTERS: Letter[] = ['A', 'B', 'C', 'D'];
const id = (l: Letter) => azLeague(l).league.league_id;
const pid = (name: string) => Object.values(azPlayers).find((p) => p.name === name)!.id;
const COUSINS = pid('Kirk Cousins');
const CALEB = pid('Caleb Williams');

interface Call {
  path: string;
  cache: RequestCache | undefined;
}

function setup() {
  const rosters: Record<string, SleeperRoster[]> = Object.fromEntries(LETTERS.map((l) => [id(l), structuredClone(azLeague(l).rosters)]));
  const failing = new Set<string>();
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/v1/, '');
    calls.push({ path, cache: init?.cache });
    if (failing.has(path)) return json({ error: 'down' }, 503);
    if (path === '/state/nfl') return json(azState);
    if (path === `/user/${AZ_OWNER}/leagues/nfl/${azState.league_season}`) return json(LETTERS.map((l) => azLeague(l).league));
    if (path === '/players/nfl') return json(azPlayersRaw);
    const m = path.match(/^\/league\/([^/]+)\/rosters$/);
    if (m && rosters[m[1]!]) return json(rosters[m[1]!]);
    return json(null, 404);
  }) as typeof fetch;
  let t = Date.parse('2026-10-28T19:00:00Z');
  const services = createServices({ client: { fetchImpl, backoffMs: 0 }, store: memoryStore(), now: () => (t += 1000) });
  return { rosters, failing, calls, services };
}

function renderApp(hash: string, env = setup()) {
  saveAccount({ username: 'fixture_owner', userId: AZ_OWNER, displayName: 'Fixture Owner' });
  location.hash = hash;
  render(
    <ServicesProvider services={env.services}>
      <App />
    </ServicesProvider>,
  );
  return env;
}

const mineIn = (rs: SleeperRoster[]) => rs.find((r) => r.owner_id === AZ_OWNER)!;

/** A saved plan in league A: Cousins out, Caleb Williams in at QB (built by the same logic the screen uses). */
function savePlan() {
  const a = azLeague('A');
  saveItems([
    newItem({
      league: a.league,
      roster: mineIn(a.rosters),
      state: azState as SleeperNflState,
      outgoing: { id: COUSINS, name: 'Kirk Cousins' },
      replacement: { id: CALEB, name: 'Caleb Williams' },
      slot: 'QB',
      slotIndex: 0,
      receivedAt: 1,
      now: 1,
      finding: { kind: 'available', reason: 'x' },
    }),
  ]);
}

beforeEach(() => localStorage.clear());

describe('Lineup Manager: main screen', () => {
  it('has its own tab, says it is read-only, and reminds you about leagues with no type', async () => {
    renderApp('#/lineups');
    expect(screen.getByRole('link', { name: 'Lineups' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/Read-only helper: this app never changes your lineup/)).toBeInTheDocument();
    expect(await screen.findByText(/4 of your 4 leagues have no type set, so they're shown for information only/)).toBeInTheDocument();
    expect(screen.getAllByText(/Saved on this device only/).length).toBeGreaterThan(0);
  });

  it('search shows position, team and injury so same-name players can be told apart', async () => {
    renderApp('#/lineups');
    const box = await screen.findByLabelText('Find a player');
    await waitFor(() => expect(box).not.toBeDisabled());
    fireEvent.change(box, { target: { value: 'kirk cou' } });
    const results = screen.getByRole('list', { name: 'Search results' });
    expect(within(results).getByRole('link', { name: /Kirk Cousins/ })).toHaveAttribute('href', `#/lineups/player/${COUSINS}`);
    expect(results).toHaveTextContent(`QB · ${azPlayers[COUSINS]!.team}`);
  });
});

describe('League types', () => {
  it('sets types in bulk or per league, shows Sleeper\'s best_ball as a hint only, and saves on this device', async () => {
    renderApp('#/lineups/types');
    const list = await screen.findByRole('list', { name: 'Leagues' });
    expect(within(list).getAllByText(/Sleeper setting: best ball on \(not documented; hint only\)/)).toHaveLength(2);
    expect(screen.getByText('0 Managed · 0 Best ball · 4 Unknown')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Change several leagues' })).getByRole('button', { name: 'Managed' }));
    expect(screen.getByText('4 Managed · 0 Best ball · 0 Unknown')).toBeInTheDocument();

    const b = screen.getByRole('group', { name: `Type for ${azLeague('B').league.name.trim()}` });
    fireEvent.click(within(b).getByRole('button', { name: 'Best ball' }));
    expect(within(b).getByRole('button', { name: 'Best ball' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('sleeper-companion:league-types')!)).toMatchObject({ [id('A')]: 'managed', [id('B')]: 'bestball' });
    expect(screen.getByText(/never guesses a league's type from its name/)).toBeInTheDocument();
  });
});

describe('Cross-league view', () => {
  it('shows every league where you roster him, with placement, badge, finding and what to check', async () => {
    saveLeagueTypes({ [id('A')]: 'managed', [id('D')]: 'managed', [id('B')]: 'bestball', [id('C')]: 'bestball' });
    renderApp(`#/lineups/player/${COUSINS}`);
    const a = await screen.findByRole('listitem', { name: `League ${azLeague('A').league.name}` });
    expect(a).toHaveTextContent('Bench option available');
    expect(a).toHaveTextContent('Starting at QB (lineup slot 1)');
    expect(within(a).getByRole('radio', { name: /Caleb Williams/ })).toBeInTheDocument();
    expect(a).toHaveTextContent("confirm in Sleeper that neither player's game has started (locked) and that neither is on a bye");
    expect(a).toHaveTextContent('not ranked');

    const c = screen.getByRole('listitem', { name: `League ${azLeague('C').league.name}` });
    expect(c).toHaveTextContent('Information only: best ball');
    expect(within(c).queryByRole('checkbox')).toBeNull();
    const dd = screen.getByRole('listitem', { name: `League ${azLeague('D').league.name}` });
    expect(dd).toHaveTextContent('On your bench');
    expect(dd).toHaveTextContent('What to check in Sleeper:');
    expect(screen.queryByRole('listitem', { name: `League ${azLeague('B').league.name}` })).toBeNull();
    expect(screen.getByText('Not on your roster in 1 of 4 leagues.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/FantasyCalc|projection/i);
  });

  it('Unknown-type leagues are information only: no candidates, no checkbox', async () => {
    renderApp(`#/lineups/player/${COUSINS}`);
    const a = await screen.findByRole('listitem', { name: `League ${azLeague('A').league.name}` });
    expect(a).toHaveTextContent('Information only: league type not set');
    expect(within(a).queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Review/ })).toBeNull();
  });

  it('a league that fails to load shows a readable error and retry without blocking the rest', async () => {
    saveLeagueTypes({ [id('A')]: 'managed' });
    const env = setup();
    env.failing.add(`/league/${id('D')}/rosters`);
    renderApp(`#/lineups/player/${COUSINS}`, env);
    expect(await screen.findByText(/Couldn't load this league:/)).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: `League ${azLeague('A').league.name}` })).toBeInTheDocument();
    env.failing.clear();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('listitem', { name: `League ${azLeague('D').league.name}` })).toBeInTheDocument();
  });

  it('a player you don\'t roster anywhere says so', async () => {
    const someone = Object.keys(azPlayers).find((p) => LETTERS.every((l) => !mineIn(azLeague(l).rosters).players!.includes(p)))!;
    renderApp(`#/lineups/player/${someone}`);
    expect(await screen.findByText(/You don't roster .* in any of your 4 leagues\./)).toBeInTheDocument();
  });
});

describe('Review and save', () => {
  it('the review screen forces a fresh read of only the selected league, shows the received-at time, and says nothing changed in Sleeper', async () => {
    saveLeagueTypes({ [id('A')]: 'managed' });
    const env = renderApp(`#/lineups/player/${COUSINS}`);
    const a = await screen.findByRole('listitem', { name: `League ${azLeague('A').league.name}` });
    fireEvent.click(within(a).getByRole('radio', { name: /Caleb Williams/ }));
    const before = env.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 change' }));
    const list = await screen.findByRole('list', { name: 'Planned changes' });
    const review = env.calls.slice(before);
    expect(review.map((c) => c.path).sort()).toEqual(['/state/nfl', `/league/${id('A')}/rosters`, `/user/${AZ_OWNER}/leagues/nfl/${azState.league_season}`].sort());
    expect(review.every((c) => c.cache === 'no-cache')).toBe(true);
    expect(list).toHaveTextContent('Out: Kirk Cousins · In: Caleb Williams · Slot: QB (lineup slot 1)');
    expect(list).toHaveTextContent(/Sleeper data received at/);
    expect(screen.getByText(/Nothing has been changed in Sleeper/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save 1 to my checklist' }));
    const card = await screen.findByRole('listitem', { name: `Plan in ${azLeague('A').league.name}` });
    expect(card).toHaveTextContent('Pending, not confirmed');
    expect(card).toHaveTextContent('Latest check: Not checked yet.');
  });

  it('a lineup changed in Sleeper between loads is dropped at review with the reason', async () => {
    saveLeagueTypes({ [id('A')]: 'managed' });
    const env = renderApp(`#/lineups/player/${COUSINS}`);
    const a = await screen.findByRole('listitem', { name: `League ${azLeague('A').league.name}` });
    fireEvent.click(within(a).getByRole('radio', { name: /Caleb Williams/ }));
    const m = mineIn(env.rosters[id('A')]!);
    m.starters = m.starters!.map((s) => (s === COUSINS ? CALEB : s)); // changed in Sleeper meanwhile
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 change' }));
    expect(await screen.findByText(/Dropped from this review: Sleeper's latest data changed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 0 to my checklist' })).toBeDisabled();
  });
});

describe('Checklist: Check again, Open in Sleeper, clearing', () => {
  it('a failed check keeps the workflow state and offers Try again; a later confirming read verifies', async () => {
    savePlan();
    const env = setup();
    env.failing.add(`/league/${id('A')}/rosters`);
    renderApp('#/lineups', env);
    const card = await screen.findByRole('listitem', { name: `Plan in ${azLeague('A').league.name}` });
    fireEvent.click(within(card).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(card).toHaveTextContent(/Check failed at .*: Sleeper's servers returned an error\. Your saved status hasn't changed\./));
    expect(card).toHaveTextContent('Pending, not confirmed');

    env.failing.clear();
    const m = mineIn(env.rosters[id('A')]!);
    m.starters = m.starters!.map((s) => (s === COUSINS ? CALEB : s));
    m.players = m.players!; // Cousins stays on the roster, now on the bench
    const before = env.calls.length;
    fireEvent.click(within(card).getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(card).toHaveTextContent('Verified as proposed'));
    expect(card).toHaveTextContent(/Checked: Sleeper data received at/);
    // Only the pending league's rosters, plus the shared state and league list.
    expect(env.calls.slice(before).map((c) => c.path).sort()).toEqual(['/state/nfl', `/league/${id('A')}/rosters`, `/user/${AZ_OWNER}/leagues/nfl/${azState.league_season}`].sort());
  });

  it('an unchanged read stays Pending; "I\'ve done this" stays labeled unverified', async () => {
    savePlan();
    renderApp('#/lineups');
    const card = await screen.findByRole('listitem', { name: `Plan in ${azLeague('A').league.name}` });
    fireEvent.click(within(card).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(card).toHaveTextContent(/Checked: Sleeper data received at/));
    expect(card).toHaveTextContent('Pending, not confirmed');
    fireEvent.click(within(card).getByRole('button', { name: "I've done this" }));
    expect(card).toHaveTextContent('Marked done by you, not confirmed');
    fireEvent.click(within(card).getByRole('button', { name: /Check again/ }));
    await waitFor(() => expect(card).toHaveTextContent(/Sleeper's data may lag/));
    expect(card).toHaveTextContent('Marked done by you, not confirmed');
  });

  it('a dropped player makes the plan Expired', async () => {
    savePlan();
    const env = setup();
    const m = mineIn(env.rosters[id('A')]!);
    m.players = m.players!.filter((p) => p !== COUSINS);
    m.starters = m.starters!.map((s) => (s === COUSINS ? CALEB : s));
    renderApp('#/lineups', env);
    fireEvent.click(await screen.findByRole('button', { name: 'Check all pending (1 league)' }));
    const card = screen.getByRole('listitem', { name: `Plan in ${azLeague('A').league.name}` });
    await waitFor(() => expect(card).toHaveTextContent('Expired'));
    expect(card).toHaveTextContent('Kirk Cousins is no longer on your roster.');
    expect(card).not.toHaveTextContent('Verified');
  });

  it('"Open in Sleeper" links to the league page and records a time only; status unchanged', async () => {
    savePlan();
    renderApp('#/lineups');
    const card = await screen.findByRole('listitem', { name: `Plan in ${azLeague('A').league.name}` });
    const link = within(card).getByRole('link', { name: /Open in Sleeper/ });
    expect(link).toHaveAttribute('href', `https://sleeper.com/leagues/${id('A')}`);
    expect(link).toHaveAttribute('target', '_blank');
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(card).toHaveTextContent(/You opened Sleeper from here at .* \(information only; it doesn't change any status\)/);
    expect(card).toHaveTextContent('Pending, not confirmed');
    expect(screen.getByText(/on phones, not yet confirmed/)).toBeInTheDocument();
  });

  it('plans are removed only when you ask: one at a time, or all after confirming', async () => {
    savePlan();
    renderApp('#/lineups');
    await screen.findByRole('listitem', { name: `Plan in ${azLeague('A').league.name}` });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('group', { name: 'Confirm clear all' })).toHaveTextContent('Remove all 1 saved plan from this device?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('listitem', { name: `Plan in ${azLeague('A').league.name}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear all' }));
    expect(screen.queryByRole('listitem', { name: /^Plan in/ })).toBeNull();
    expect(localStorage.getItem('sleeper-companion:lineup-items')).toBeNull();
  });
});
