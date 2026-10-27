import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/App';
import { createServices, ServicesProvider } from '../src/services';
import { memoryStore } from '../src/storage/idb';
import { saveAccount } from '../src/storage/prefs';
import { AZ_OWNER, azFcText, azLeague, azPlayersRaw, azState, type Letter } from './analyzerHelpers';
import { emptyIndex, runRefresh } from '../src/valuations/fantasycalc/refresh';
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

function renderApp(hash: string, opts: { fetchImpl?: typeof fetch; values?: Record<string, string> | 'offline'; now?: number } = {}) {
  saveAccount({ username: 'fixture_owner', userId: AZ_OWNER, displayName: 'Fixture Owner' });
  location.hash = hash;
  const services = createServices({
    client: { fetchImpl: opts.fetchImpl ?? analyzerFetch(), backoffMs: 0 },
    store: memoryStore(),
    valuesFetch: valuesFetch(opts.values ?? {}),
    ...(opts.now ? { now: () => opts.now! } : {}),
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
    const notice = (await screen.findAllByText(/used for the positional market-value analysis/))[0]!.closest('p')!;
    expect(notice).toHaveTextContent('(display-only) and shown as roster and pick context. They are not used to decide tiers or your stance.');
    expect(notice).not.toHaveTextContent(/context only/);
    await waitFor(() => expect(screen.getAllByText(/FantasyCalc context: roster/).length).toBe(12));
    expect(screen.getAllByRole('link', { name: 'FantasyCalc.com' }).length).toBeGreaterThan(0);
  });

  it('warns when the FantasyCalc context is older than 6 hours, with the failed refresh', async () => {
    const values = await publishedValues({ failLaterAt: '2026-10-25T05:30:00.000Z' }); // snapshot from 02:00
    renderApp(`#/analyzer/${leagueId('A')}`, { values, now: Date.parse('2026-10-25T09:00:00.000Z') });
    expect(await screen.findByText(/These values are 7 h old/)).toHaveTextContent('The latest refresh failed: FantasyCalc returned HTTP 503');
    expect(screen.getByRole('region', { name: 'Your team' })).toBeInTheDocument(); // tiers unaffected
  });

  it('shows no stale warning while the FantasyCalc context is fresh', async () => {
    renderApp(`#/analyzer/${leagueId('A')}`, { values: await publishedValues(), now: Date.parse('2026-10-25T03:00:00.000Z') });
    await screen.findAllByText(/used for the positional market-value analysis/);
    expect(screen.queryByText(/These values are .* old/)).not.toBeInTheDocument();
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

// ---------- Stage 4: positional market value (real FantasyCalc values published 2026-10-26) ----------
async function azPublished(formats: (10 | 12)[] = [12, 10]) {
  const r = await runRefresh(
    emptyIndex(),
    formats.map((numTeams) => ({ isDynasty: true, numQbs: 2 as const, numTeams, ppr: 1 as const, tep: 'te+' as const })),
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
const NOTE = /Market value, not projected production\./;

describe('positional market value screens', () => {
  it('shows the overview, market-value reasons and "what to look for", each with the market-value note', async () => {
    renderApp(`#/analyzer/${leagueId('A')}`, { values: await azPublished(), now: Date.parse('2026-10-26T15:00:00Z') });
    const overview = await screen.findByRole('region', { name: 'Positional market value overview' });
    expect(overview).toHaveTextContent(NOTE);
    expect(within(overview).getAllByRole('row')).toHaveLength(5); // header + QB/RB/WR/TE
    expect(within(overview).getByRole('link', { name: 'FantasyCalc.com' })).toBeInTheDocument();

    // Every tier card gets a market-value line; existing reasons are untouched.
    await waitFor(() => expect(screen.getAllByText(/^Market value: /)).toHaveLength(12));
    const card = screen.getByRole('region', { name: 'Your team' });
    expect(card).toHaveTextContent('4-2, 4th in points, 1 game clear of the cutoff.');
    expect(card).toHaveTextContent('Not enough data for a confident recommendation. Leaning: Buy.');
    const look = within(card).getByLabelText('What to look for');
    expect(look).toHaveTextContent(NOTE);
    expect(look).toHaveTextContent(/No position stands out|Top needs|Top surpluses/);
  });

  it("opens a team profile with both lineups, value by position and data coverage", async () => {
    renderApp(`#/analyzer/${leagueId('A')}`, { values: await azPublished(), now: Date.parse('2026-10-26T15:00:00Z') });
    const card = await screen.findByRole('region', { name: 'Your team' });
    const toggle = await within(card).findByRole('button', { name: /Team profile \(market value\)/ });
    fireEvent.click(toggle);
    const profile = within(card).getByLabelText('Profile your team');
    expect(profile).toHaveTextContent(NOTE);
    expect(profile).toHaveTextContent("Sleeper's current starters");
    expect(profile).toHaveTextContent('Exactly as stored in Sleeper.');
    expect(profile).toHaveTextContent('Market-value lineup (estimate)');
    expect(profile).toHaveTextContent('Not a weekly lineup recommendation.');
    expect(profile).toHaveTextContent(/of \d+ rostered players have no FantasyCalc value\. They're left out of totals, not counted as zero\./);
    const table = within(profile).getByRole('table', { name: 'Value by position' });
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(table).toHaveTextContent('#2 of 12');
    expect(profile).toHaveTextContent('Stashed (not in lineup)');
  });

  it('10-team league uses the 10-team values', async () => {
    renderApp(`#/analyzer/${leagueId('D')}`, { values: await azPublished(), now: Date.parse('2026-10-26T15:00:00Z') });
    const card = await screen.findByRole('region', { name: 'Your team' });
    await waitFor(() => expect(within(card).getByLabelText('What to look for')).toHaveTextContent(/Top surpluses: QB \(.*Aaron Rodgers/));
  });

  it("says clearly when positional analysis isn't available, and tiers still show", async () => {
    renderApp(`#/analyzer/${leagueId('D')}`, { values: await azPublished([12]), now: Date.parse('2026-10-26T15:00:00Z') });
    expect(await screen.findByText(/Positional market value: No FantasyCalc values have been published for this league's format yet\./)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Your team' })).getByLabelText('What to look for')).toHaveTextContent('Not enough data to say');
    expect(screen.getAllByRole('listitem', { name: /^Team / })).toHaveLength(10);
  });
});

describe('Leagues tab: standings on each league card', () => {
  it('shows your record and place, points for and its rank, and the league high (real redacted data)', async () => {
    renderApp('#/');
    const card = await screen.findByRole('link', { name: /Analyzer Fixture A/ });
    await waitFor(() => expect(card).toHaveTextContent('Standings4-2 · 4/12'));
    expect(card).toHaveTextContent('Points for949.4 · 4/12');
    expect(card).toHaveTextContent('League high988.0 PF');
    expect(card).not.toHaveTextContent('Format');
    expect(card).not.toHaveTextContent('Roster');
    const d = screen.getByRole('link', { name: /Analyzer Fixture D/ });
    await waitFor(() => expect(d).toHaveTextContent('Standings4-2 · 3/10'));
    expect(d).toHaveTextContent('Points for1,078.0 · 2/10');
    expect(d).toHaveTextContent('League high1,158.0 PF');
  });
});
