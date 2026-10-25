import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/App';
import { createServices, ServicesProvider } from '../src/services';
import { memoryStore } from '../src/storage/idb';
import { saveAccount } from '../src/storage/prefs';
import { AZ_OWNER, azLeague, azPlayersRaw, azState, type Letter } from './analyzerHelpers';
import { json, publishedValues, valuesFetch } from './helpers';

const LETTERS: Letter[] = ['A', 'B', 'C', 'D'];
const leagueId = (l: Letter) => azLeague(l).league.league_id;

/** Serves the redacted analyzer fixtures by Sleeper URL path. */
function analyzerFetch() {
  const routes: Record<string, unknown> = {
    '/state/nfl': azState,
    [`/user/${AZ_OWNER}/leagues/nfl/${azState.league_season}`]: LETTERS.map((l) => azLeague(l).league),
    '/players/nfl': azPlayersRaw,
  };
  for (const l of LETTERS) {
    const d = azLeague(l);
    const id = d.league.league_id;
    routes[`/league/${id}`] = d.league;
    routes[`/league/${id}/rosters`] = d.rosters;
    routes[`/league/${id}/users`] = d.users;
    routes[`/league/${id}/traded_picks`] = d.tradedPicks;
    routes[`/league/${id}/transactions/${azState.week}`] = d.transactions;
  }
  return (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname.replace(/^\/v1/, '');
    if (path in routes) return json(routes[path]);
    if (/\/transactions\/\d+$/.test(path)) return json([]);
    return json(null, 404);
  }) as typeof fetch;
}

function renderApp(hash: string, opts: { fetchImpl?: typeof fetch; values?: Record<string, string> | 'offline' } = {}) {
  saveAccount({ username: 'fixture_owner', userId: AZ_OWNER, displayName: 'Fixture Owner' });
  location.hash = hash;
  const services = createServices({
    client: { fetchImpl: opts.fetchImpl ?? analyzerFetch(), backoffMs: 0 },
    store: memoryStore(),
    valuesFetch: valuesFetch(opts.values ?? {}),
  });
  return render(
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>,
  );
}

describe('Team Analyzer screens', () => {
  it('has a Team Analyzer tab that lists the leagues', async () => {
    renderApp('#/');
    const tabs = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(tabs).getByRole('link', { name: 'Team Analyzer' })).toHaveAttribute('href', '#/analyzer');
    expect(within(tabs).getByRole('link', { name: 'Leagues' })).toHaveAttribute('aria-current', 'page');
  });

  it('lists leagues with links to each analysis', async () => {
    renderApp('#/analyzer');
    expect(await screen.findByRole('link', { name: /Analyzer Fixture A/ })).toHaveAttribute('href', `#/analyzer/${leagueId('A')}`);
    expect(screen.getAllByRole('link', { name: /Analyzer Fixture/ })).toHaveLength(4);
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Team Analyzer' })).toHaveAttribute('aria-current', 'page');
  });

  it('analyzes one league: every team in a tier, a your-team card, and the estimate disclaimer', async () => {
    renderApp(`#/analyzer/${leagueId('A')}`);
    const card = await screen.findByRole('region', { name: 'Your team' });
    expect(card).toHaveTextContent('Tier: Contenders');
    expect(card).toHaveTextContent('Not enough data for a confident recommendation. Leaning: Buy.');
    expect(card).toHaveTextContent('Low confidence');
    expect(card).toHaveTextContent('4-2, 4th in points, 1 game clear of the cutoff.');
    expect(screen.getByText(/These are estimates/)).toBeInTheDocument();

    const teams = screen.getAllByRole('listitem', { name: /^Team / });
    expect(teams).toHaveLength(12);
    for (const tier of ['Contenders', 'Bubble', 'Sellers', 'Deep Rebuild']) expect(screen.getByRole('region', { name: tier })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Contenders' })).getAllByRole('listitem', { name: /^Team / })).toHaveLength(4);
    expect(screen.getByText(/\(you\)/)).toBeInTheDocument();
    expect(screen.getByText(/Dynasty logic: standings decide the tier/)).toBeInTheDocument();
  });

  it('gives a confident Buy when the data supports it (12-0 in a median league)', async () => {
    renderApp(`#/analyzer/${leagueId('C')}`);
    const card = await screen.findByRole('region', { name: 'Your team' });
    expect(card).toHaveTextContent('Suggested stance: Buy');
    expect(card).toHaveTextContent('High confidence');
    expect(screen.getByText(/2 games a week, counting the league median/)).toBeInTheDocument();
  });

  it('shows FantasyCalc context with attribution, labeled as not used for tiers', async () => {
    renderApp(`#/analyzer/${leagueId('A')}`, { values: await publishedValues() });
    expect(await screen.findByText(/are shown for context only and are/)).toHaveTextContent('not used');
    await waitFor(() => expect(screen.getAllByText(/FantasyCalc context: roster/).length).toBe(12));
    expect(screen.getAllByRole('link', { name: 'FantasyCalc.com' }).length).toBeGreaterThan(0);
  });

  it("says when there are no FantasyCalc values for the league's format, without affecting tiers", async () => {
    renderApp(`#/analyzer/${leagueId('D')}`, { values: await publishedValues() }); // only the 12-team set is published
    expect(await screen.findByText(/No FantasyCalc values for this league's format/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your team' })).toHaveTextContent('Suggested stance: Buy');
  });

  it('shows a readable error when the network is down', async () => {
    renderApp(`#/analyzer/${leagueId('A')}`, {
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't analyze this league");
    expect(alert).toHaveTextContent("Couldn't reach Sleeper. Check your internet connection and try again.");
  });
});
