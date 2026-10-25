import { useCallback } from 'react';
import { Button, ErrorMessage, Loading, Notice, Screen, formatTime } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { leagueStatusLabel, summarizeLeague } from '../../domain/league';
import { useServices } from '../../services';
import type { SavedAccount } from '../../storage/prefs';

export function LeagueListScreen({ account, onChangeUser }: { account: SavedAccount; onChangeUser: () => void }) {
  const services = useServices();
  const load = useCallback(
    async (force: boolean) => {
      const state = await services.cached('state:nfl', () => services.api.getNflState(), force);
      const season = state.data.league_season || state.data.season;
      const leagues = await services.cached(`leagues:${account.userId}:${season}`, () => services.api.getUserLeagues(account.userId, season), force);
      return { state: state.data, season, leagues: leagues.data.map(summarizeLeague), fetchedAt: leagues.fetchedAt };
    },
    [services, account.userId],
  );
  const { state, reload } = useAsync(`leagues:${account.userId}`, load);
  const data = state.data;

  return (
    <Screen
      title="Your leagues"
      subtitle={
        <>
          Signed in as <span className="text-slate-200">{account.displayName}</span>
          {data && (
            <>
              {' '}· {data.season} season · NFL week {data.state.week} ({data.state.season_type})
            </>
          )}
        </>
      }
      actions={
        <>
          <Button onClick={reload} disabled={state.status === 'loading'} aria-label="Refresh leagues">
            Refresh
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {state.status === 'loading' && <Loading label={data ? 'Refreshing…' : 'Loading your leagues…'} />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't load your leagues" onRetry={reload} />}
        <a href="#/values" className="flex min-h-11 items-center justify-between rounded-xl bg-slate-900 px-4 text-sm text-slate-200 hover:bg-slate-800">
          <span>Player values &amp; match report</span>
          <span aria-hidden className="text-emerald-400">→</span>
        </a>
        {data && (
          <p className="text-xs text-slate-500">
            {data.leagues.length} league{data.leagues.length === 1 ? '' : 's'} · Updated {formatTime(data.fetchedAt)}
            {state.status === 'error' && ' (showing earlier data)'}
          </p>
        )}
        {data && data.leagues.length === 0 && <Notice>No NFL leagues found for the {data.season} season on this account.</Notice>}
        <ul className="space-y-3">
          {data?.leagues.map((l) => (
            <li key={l.id}>
              <a
                href={`#/league/${l.id}`}
                className="block rounded-xl bg-slate-900 p-4 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words font-medium text-slate-50">{l.name}</h2>
                  <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{leagueStatusLabel(l.status)}</span>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-500">Format</dt>
                  <dd className="text-slate-200">{l.format} · {l.teams} teams</dd>
                  <dt className="text-slate-500">Scoring</dt>
                  <dd className="text-slate-200">{l.scoring}</dd>
                  <dt className="text-slate-500">Roster</dt>
                  <dd className="text-slate-200">
                    {l.rosterSize} spots ({l.starterSlots} starters + {l.benchSlots} bench)
                    {l.reserveSlots > 0 && ` · ${l.reserveSlots} IR`}
                    {l.taxiSlots > 0 && ` · ${l.taxiSlots} taxi`}
                  </dd>
                </dl>
                {l.unsupported.length > 0 && (
                  <p className="mt-2 text-xs text-amber-300">Not supported by this app yet: {l.unsupported.join(', ')}</p>
                )}
              </a>
            </li>
          ))}
        </ul>
        <div className="pt-4">
          <Button onClick={onChangeUser}>Use a different username</Button>
        </div>
      </div>
    </Screen>
  );
}
