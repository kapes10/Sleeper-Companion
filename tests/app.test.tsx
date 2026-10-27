import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../src/App';
import { createServices, ServicesProvider } from '../src/services';
import { memoryStore } from '../src/storage/idb';
import { loadAccount, saveAccount } from '../src/storage/prefs';
import { fixtureFetch, LEAGUE_01_ID, LEAGUE_02_ID, OWNER_ID } from './helpers';

function renderApp(fetchImpl: typeof fetch) {
  const services = createServices({ client: { fetchImpl, backoffMs: 0 }, store: memoryStore() });
  return render(
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>,
  );
}

const signIn = () => saveAccount({ username: 'fixture_owner', userId: OWNER_ID, displayName: 'Fixture Owner' });

describe('app screens (fixture-backed)', () => {
  it('looks up a username, remembers it, and lists every league', async () => {
    location.hash = '';
    renderApp(fixtureFetch().impl);
    fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: '@fixture_owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Fixture League 01')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Fixture League/ })).toHaveLength(23);
    expect(screen.getByText(/23 leagues/)).toBeInTheDocument();
    expect(loadAccount()).toEqual({ username: 'fixture_owner', userId: OWNER_ID, displayName: 'Fixture Owner' });

    const card = screen.getByRole('link', { name: /Fixture League 02/ });
    expect(within(card).getByText('PPR · TE +0.5/rec · 6pt pass TD')).toBeInTheDocument();
    // Format and Roster lines were replaced by Standings / Points for / League high (2026-10-27).
    expect(card).not.toHaveTextContent('Format');
    expect(card).not.toHaveTextContent(/spots \(/);
    expect(await within(card).findByText('Standings')).toBeInTheDocument();
    // Leagues whose rosters can't be loaded say so instead of hiding the card.
    const other = screen.getByRole('link', { name: /Fixture League 03/ });
    expect(await within(other).findByText("Couldn't load standings")).toBeInTheDocument();
  });

  it('shows an unknown username as a readable message', async () => {
    location.hash = '';
    renderApp(fixtureFetch().impl);
    fireEvent.change(screen.getByLabelText('Sleeper username'), { target: { value: 'nobody_here' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No Sleeper account found for "nobody_here"/);
  });

  it("shows the owner's starters, bench, IR and taxi for a league", async () => {
    signIn();
    location.hash = `#/league/${LEAGUE_02_ID}`;
    renderApp(fixtureFetch().impl);
    const starters = await screen.findByRole('region', { name: 'Starters' });
    expect(within(starters).getByText('Kirk Cousins')).toBeInTheDocument();
    expect(within(starters).getByText('Brock Purdy')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Bench' })).getAllByRole('listitem')).toHaveLength(10);
    expect(within(screen.getByRole('region', { name: 'Injured reserve' })).getAllByRole('listitem')).toHaveLength(4);
    expect(within(screen.getByRole('region', { name: 'Taxi squad' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('marks empty slots and explains best ball', async () => {
    signIn();
    location.hash = `#/league/${LEAGUE_01_ID}`;
    renderApp(fixtureFetch().impl);
    const starters = await screen.findByRole('region', { name: 'Starters' });
    expect(within(starters).getAllByText('Empty')).toHaveLength(2);
    expect(screen.getByText(/Best ball league/)).toBeInTheDocument();
  });

  it('downloads the player list only once across league visits', async () => {
    signIn();
    const { impl, calls } = fixtureFetch();
    location.hash = `#/league/${LEAGUE_01_ID}`;
    renderApp(impl);
    await screen.findByRole('region', { name: 'Starters' });
    location.hash = `#/league/${LEAGUE_02_ID}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByText('Kirk Cousins')).toBeInTheDocument();
    expect(calls.filter((c) => c === '/players/nfl')).toHaveLength(1);
  });

  it('shows a readable error with a retry button when the network is down', async () => {
    signIn();
    location.hash = '#/';
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    renderApp(offline);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your leagues");
    expect(alert).toHaveTextContent("Couldn't reach Sleeper. Check your internet connection and try again.");
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a readable error on the roster screen when the network is down', async () => {
    signIn();
    location.hash = `#/league/${LEAGUE_02_ID}`;
    renderApp((async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't reach Sleeper/);
  });
});
