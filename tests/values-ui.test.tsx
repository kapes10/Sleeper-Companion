import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { App } from '../src/App';
import { createServices, ServicesProvider } from '../src/services';
import { memoryStore, type KeyValueStore } from '../src/storage/idb';
import { saveAccount } from '../src/storage/prefs';
import { FC_12, fixtureFetch, LEAGUE_02_ID, OWNER_ID, publishedValues, valuesFetch } from './helpers';

const HOUR = 3_600_000;
const FETCHED = '2026-10-25T02:00:00.000Z';

function renderApp(opts: { values: Record<string, string> | 'offline'; now?: number; store?: KeyValueStore; hash: string }) {
  saveAccount({ username: 'fixture_owner', userId: OWNER_ID, displayName: 'Fixture Owner' });
  location.hash = opts.hash;
  const now = opts.now ?? Date.parse(FETCHED) + HOUR;
  const services = createServices({
    client: { fetchImpl: fixtureFetch().impl, backoffMs: 0 },
    store: opts.store ?? memoryStore(),
    now: () => now,
    valuesFetch: valuesFetch(opts.values),
  });
  return render(
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>,
  );
}

const valueOf = (playerName: string) => {
  const row = screen.getByText(playerName).closest('li')!;
  return within(row).getByTestId('player-value').textContent;
};

describe('roster view with FantasyCalc values', () => {
  it('shows scaled values for matched players, "no value" for the rest, and names the snapshot used', async () => {
    renderApp({ values: await publishedValues(), hash: `#/league/${LEAGUE_02_ID}` });
    const panel = await screen.findByRole('region', { name: 'Player values' });
    expect(panel).toHaveTextContent('Using FantasyCalc market value · Dynasty · Superflex/2QB · 12 teams · PPR 1 · TE+');
    expect(panel).toHaveTextContent('24 of 25 players on this roster have a value');
    expect(within(panel).getByRole('link', { name: 'FantasyCalc.com' })).toHaveAttribute('href', 'https://fantasycalc.com');

    await waitFor(() => expect(valueOf('Brock Purdy')).toBe('596,309'));
    expect(valueOf('Kirk Cousins')).toBe('151,618');
    expect(valueOf('Luke McCaffrey')).toBe('no value');
    expect(screen.queryByText(/These values are .* old/)).not.toBeInTheDocument();
  });

  it('lists what FantasyCalc does not model for this league', async () => {
    renderApp({ values: await publishedValues(), hash: `#/league/${LEAGUE_02_ID}` });
    const panel = await screen.findByRole('region', { name: 'Player values' });
    await waitFor(() => expect(panel).toHaveTextContent("What these values don't account for"));
    expect(panel).toHaveTextContent('TE premium +0.5/catch uses FantasyCalc\'s te+ tier');
  });

  it('warns when values are older than 6 hours and the latest refresh failed, keeping the old values', async () => {
    const values = await publishedValues({ failLaterAt: '2026-10-25T05:30:00.000Z' });
    renderApp({ values, now: Date.parse(FETCHED) + 7 * HOUR, hash: `#/league/${LEAGUE_02_ID}` });
    expect(await screen.findByText(/These values are 7 h old/)).toHaveTextContent('The latest refresh failed: FantasyCalc returned HTTP 503');
    await waitFor(() => expect(valueOf('Brock Purdy')).toBe('596,309'));
  });

  it("shows a different warning when no values exist for the league's format", async () => {
    const tenTeamOnly = await publishedValues({ params: [{ ...FC_12, numTeams: 10 }] });
    renderApp({ values: tenTeamOnly, hash: `#/league/${LEAGUE_02_ID}` });
    expect(await screen.findByText(/No FantasyCalc values exist yet for this league's format/)).toBeInTheDocument();
    await waitFor(() => expect(valueOf('Brock Purdy')).toBe('no value'));
  });

  it('treats "nothing published yet" as missing values, not an error', async () => {
    renderApp({ values: {}, hash: `#/league/${LEAGUE_02_ID}` });
    expect(await screen.findByText(/No FantasyCalc values exist yet/)).toBeInTheDocument();
  });

  it('shows a readable error if values cannot be downloaded, and still shows the roster', async () => {
    renderApp({ values: 'offline', hash: `#/league/${LEAGUE_02_ID}` });
    expect(await screen.findByText("Couldn't load player values")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load player values. Check your internet connection/)).toBeInTheDocument();
    expect(screen.getByText('Brock Purdy')).toBeInTheDocument();
    expect(screen.queryAllByTestId('player-value')).toHaveLength(0);
  });
});

describe('match report', () => {
  it('shows exact counts, the snapshot time and parameters, and lists unmatched rows', async () => {
    const values = await publishedValues({
      extraRows: [{ player: { id: 1, name: 'Unknown Rookie', position: 'WR', maybeTeam: 'NYJ', sleeperId: '99999999' }, value: 42, overallRank: 999 }],
    });
    renderApp({ values, hash: '#/values' });
    const report = await screen.findByRole('article', { name: 'FantasyCalc dynasty-2qb-12tm-ppr1-teplus' });
    expect(report).toHaveTextContent('Dynasty · Superflex/2QB · 12 teams · PPR 1 · TE+');
    expect(report).toHaveTextContent('Used by 22 of your leagues');
    expect(report).toHaveTextContent('isDynasty=true&numQbs=2&numTeams=12&ppr=1&tep=te%2B');
    expect(report).toHaveTextContent(/Snapshot from .* \(1 h ago\)/);
    const stat = (label: string) => within(report).getByText(label).nextSibling?.textContent;
    expect(stat('Player rows')).toBe('49');
    expect(stat('Matched')).toBe('48');
    expect(stat('Unmatched')).toBe('1');
    expect(report).toHaveTextContent('3 draft-pick values stored, not used yet.');
    expect(report).toHaveTextContent("Unknown Rookie WR · NYJSleeper ID isn't in Sleeper's player list (Sleeper ID 99999999)");
    expect(screen.getByText(/No FantasyCalc values exist yet for 1 of your leagues/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'FantasyCalc.com' }).length).toBeGreaterThan(0);
  });
});

describe('manual CSV import', () => {
  const upload = (text: string, name = 'values.csv') =>
    fireEvent.change(screen.getByLabelText(/Choose a CSV file/), { target: { files: [new File([text], name, { type: 'text/csv' })] } });

  it('rejects a broken file with a clear message and saves nothing', async () => {
    renderApp({ values: {}, hash: '#/import' });
    upload('id,value\n1,2\n3\n');
    expect(await screen.findByRole('alert')).toHaveTextContent("This file can't be importedLine 3 has 1 values but the header has 2 columns.");
    expect(screen.queryByRole('button', { name: 'Save set' })).not.toBeInTheDocument();
  });

  it('imports, previews and saves a CSV, which the roster can then show — separately from FantasyCalc', async () => {
    const store = memoryStore();
    const { unmount } = renderApp({ values: await publishedValues(), store, hash: '#/import' });
    upload(readFileSync('tests/fixtures/csv/synthetic-sample.csv', 'utf8'), 'my-values.csv');

    const preview = await screen.findByRole('region', { name: 'Preview' });
    expect(preview).toHaveTextContent('5 usable row(s)');
    expect(within(preview).getByText('Brock Purdy')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save set' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: 'Test spreadsheet' } });
    fireEvent.change(screen.getByLabelText('Export date'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'dynasty' } });
    fireEvent.change(screen.getByLabelText('QB setting'), { target: { value: '2' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(await screen.findByText(/Saved “my-values” with 5 values/)).toBeInTheDocument();
    unmount();

    renderApp({ values: await publishedValues(), store, hash: `#/league/${LEAGUE_02_ID}` });
    await waitFor(() => expect(valueOf('Brock Purdy')).toBe('596,309')); // FantasyCalc by default
    fireEvent.click(await screen.findByRole('button', { name: 'Manual CSV' }));
    const panel = screen.getByRole('region', { name: 'Player values' });
    expect(panel).toHaveTextContent('Using manual CSV “my-values” · Dynasty · Superflex/2QB');
    expect(panel).toHaveTextContent('Source: Test spreadsheet · exported 2026-10-20');
    expect(valueOf('Brock Purdy')).toBe('726,500'); // 6,500 ÷ 9,000 top → 72
    expect(valueOf('Tee Higgins')).toBe('no value');
  });

  it('requires consent before skipping problem rows', async () => {
    renderApp({ values: {}, hash: '#/import' });
    upload('sleeper_id,value\n8183,100\n1166,abc\n');
    await screen.findByRole('region', { name: 'Preview' });
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Export date'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'dynasty' } });
    fireEvent.change(screen.getByLabelText('QB setting'), { target: { value: '2' } });
    const save = screen.getByRole('button', { name: 'Save set' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Import the 1 usable rows and skip the 1 row/));
    expect(save).toBeEnabled();
  });
});
