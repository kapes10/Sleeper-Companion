import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/App';
import { createServices, ServicesProvider } from '../src/services';
import { memoryStore } from '../src/storage/idb';
import { saveAccount } from '../src/storage/prefs';
import { emptyIndex, runRefresh } from '../src/valuations/fantasycalc/refresh';
import { AZ_OWNER, azFcText, azLeague, azPlayersRaw, azState, type Letter } from './analyzerHelpers';
import { json, valuesFetch } from './helpers';

const LETTERS: Letter[] = ['A', 'B', 'C', 'D'];
const leagueId = (l: Letter) => azLeague(l).league.league_id;

function analyzerFetch() {
  const routes: Record<string, unknown> = {
    '/state/nfl': azState,
    [`/user/${AZ_OWNER}/leagues/nfl/${azState.league_season}`]: LETTERS.map((l) => azLeague(l).league),
    '/players/nfl': azPlayersRaw,
  };
  for (const l of LETTERS) {
    const d = azLeague(l);
    const id = d.league.league_id;
    Object.assign(routes, {
      [`/league/${id}`]: d.league,
      [`/league/${id}/rosters`]: d.rosters,
      [`/league/${id}/users`]: d.users,
      [`/league/${id}/traded_picks`]: d.tradedPicks,
      [`/league/${id}/transactions/${azState.week}`]: d.transactions,
    });
  }
  return (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname.replace(/^\/v1/, '');
    if (path in routes) return json(routes[path]);
    if (/\/transactions\/\d+$/.test(path)) return json([]);
    return json(null, 404);
  }) as typeof fetch;
}

async function published() {
  const r = await runRefresh(
    emptyIndex(),
    ([12, 10] as const).map((numTeams) => ({ isDynasty: true, numQbs: 2 as const, numTeams, ppr: 1 as const, tep: 'te+' as const })),
    {
      now: () => Date.parse('2026-10-26T14:20:35.021Z'),
      get: async (url) => ({ status: 200, text: azFcText(url.includes('numTeams=10') ? 'dynasty-2qb-10tm-ppr1-teplus' : 'dynasty-2qb-12tm-ppr1-teplus') }),
      sha256: async () => 'test',
    },
  );
  const files: Record<string, string> = { 'index.json': JSON.stringify(r.index) };
  for (const w of r.writes) files[w.path] = w.content;
  return files;
}

async function renderApp(hash: string) {
  saveAccount({ username: 'fixture_owner', userId: AZ_OWNER, displayName: 'Fixture Owner' });
  location.hash = hash;
  const services = createServices({
    client: { fetchImpl: analyzerFetch(), backoffMs: 0 },
    store: memoryStore(),
    valuesFetch: valuesFetch(await published()),
    now: () => Date.parse('2026-10-26T15:00:00Z'),
  });
  return render(
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>,
  );
}

describe('Trade partners view', () => {
  it('is linked from your team card in the Team Analyzer', async () => {
    await renderApp(`#/analyzer/${leagueId('D')}`);
    const card = await screen.findByRole('region', { name: 'Your team' });
    expect(within(card).getByRole('link', { name: /Trade partners/ })).toHaveAttribute('href', `#/analyzer/${leagueId('D')}/partners`);
  });

  it('confident Buy: shows your stance, labeled estimates, and ordered partners with reasons and assets to consider', async () => {
    await renderApp(`#/analyzer/${leagueId('D')}/partners`);
    const partners = await screen.findByRole('list', { name: 'Suggested trade partners' });
    expect(screen.getByText(/Estimates based on market value/).closest('div')).toHaveTextContent('not trade proposals, not fairness judgments, and not predictions of what anyone would accept. Nothing is sent to anyone.');
    expect(screen.getAllByText(/Market value, not projected production\./).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Your stance' })).toHaveTextContent('Suggested stance: Buy');

    const cards = within(partners).getAllByRole('listitem', { name: /^Partner / });
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent(/^#1 /);
    expect(cards[1]).toHaveTextContent(/#2 \(tied\)/);
    expect(cards[2]).toHaveTextContent(/#2 \(tied\)/);
    for (const c of cards) {
      expect(c).toHaveTextContent('(inferred from their tier, an estimate)');
      expect(c).toHaveTextContent('They have a need at QB, where you have surplus market value.');
      expect(within(c).getByText('Win-now upgrades on their roster (assets to consider)')).toBeInTheDocument();
      expect(within(c).getByText('Your assets they might value: surplus, young players, picks')).toBeInTheDocument();
      expect(c).toHaveTextContent('Your surplus at their need');
      expect(c).toHaveTextContent('Only players and picks worth at least 10 on the 0–100 scale are suggested.');
      expect(c).toHaveTextContent('Aaron Rodgers');
    }
    expect(cards[0]).toHaveTextContent('1 completed trade in the last 3 weeks (context only');
    expect(screen.getByRole('link', { name: 'FantasyCalc.com' })).toBeInTheDocument();
  });

  it('shows the trade deadline label (99 is labeled an observed convention)', async () => {
    await renderApp(`#/analyzer/${leagueId('D')}/partners`);
    const stance = await screen.findByRole('region', { name: 'Your stance' });
    const d = azLeague('D').league.settings.trade_deadline;
    expect(stance).toHaveTextContent(d === 99 ? /observed convention, not documented/ : `Trade deadline: week ${d}.`);
  });

  it('protecting a player removes them from offers, and the choice is saved on this device only', async () => {
    await renderApp(`#/analyzer/${leagueId('D')}/partners`);
    await screen.findByRole('list', { name: 'Suggested trade partners' });
    const section = screen.getByLabelText('Protected players');
    expect(section).toHaveTextContent('saved on this device only');
    expect(section).toHaveTextContent('does not sync to your other devices, and nothing is sent to Sleeper or other managers');
    const btn = within(section).getByRole('button', { name: 'Protect Aaron Rodgers' });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByRole('list', { name: 'Suggested trade partners' })).not.toHaveTextContent('Aaron Rodgers'));
    expect(screen.getByRole('list', { name: 'Suggested trade partners' })).toHaveTextContent('Tanner McKee');
    expect(JSON.parse(localStorage.getItem(`sleeper-companion:protected:${leagueId('D')}`)!)).toHaveLength(1);
  });

  it('low-confidence leaning: the list carries a visible caveat', async () => {
    await renderApp(`#/analyzer/${leagueId('B')}/partners`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Low-confidence stance\. Your stance is only a low-confidence leaning toward selling/);
  });

  it('no reasonable fit: an explanation instead of a list', async () => {
    await renderApp(`#/analyzer/${leagueId('A')}/partners`);
    expect(await screen.findByText(/^No reasonable fit: no team's surpluses match your needs/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Suggested trade partners' })).not.toBeInTheDocument();
  });
});
