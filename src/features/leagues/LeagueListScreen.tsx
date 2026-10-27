import { useCallback } from 'react';
import { Button, ErrorMessage, Loading, Notice, Screen, formatTime } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { leagueStatusLabel } from '../../domain/league';
import { MainTabs } from '../../components/MainTabs';
import { loadMyLeagues } from './loadLeagues';
import { useServices } from '../../services';
import type { SavedAccount } from '../../storage/prefs';
import { ownerStanding, type OwnerStanding } from '../../analysis/ownerStanding';

const pts = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function LeagueListScreen({ account, onChangeUser }: { account: SavedAccount; onChangeUser: () => void }) {
  const services = useServices();
  const load = useCallback((force: boolean) => loadMyLeagues(services, account, force), [services, account]);
  const { state, reload } = useAsync(`leagues:${account.userId}`, load);
  const data = state.data;

  // Your standing in each league. Loaded after the list (one rosters call per league, shared
  // cache with the roster screen); one league failing never hides the others.
  const leagueIds = data?.leagues.map((l) => l.id) ?? [];
  const loadStandings = async (force: boolean): Promise<Map<string, OwnerStanding | null>> => {
    const results = await Promise.allSettled(
      leagueIds.map((id) => services.cached(`rosters:${id}`, () => services.api.getRosters(id), force).then((r) => ownerStanding(r.data, account.userId))),
    );
    return new Map(leagueIds.map((id, i) => [id, results[i]!.status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<OwnerStanding>).value : null]));
  };
  // Keyed by the league list, so it reloads when the list changes.
  const standings = useAsync(`standings:${account.userId}:${leagueIds.join(',')}`, loadStandings);

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
          <Button
            onClick={() => {
              reload();
              standings.reload();
            }}
            disabled={state.status === 'loading'}
            aria-label="Refresh leagues"
          >
            Refresh
          </Button>
        </>
      }
    >
      <MainTabs active="leagues" />
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
                  <StandingRows standing={standings.state.data?.get(l.id)} loading={standings.state.status === 'loading'} />
                  <dt className="text-slate-500">Scoring</dt>
                  <dd className="text-slate-200">{l.scoring}</dd>
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

/** Standings, Points for and League high rows for one league card. */
function StandingRows({ standing, loading }: { standing: OwnerStanding | null | undefined; loading: boolean }) {
  if (standing === undefined) {
    return (
      <>
        <dt className="text-slate-500">Standings</dt>
        <dd className="text-slate-500">{loading ? 'Loading…' : '—'}</dd>
      </>
    );
  }
  if (standing === null || standing.kind !== 'ok') {
    const text = standing === null ? "Couldn't load standings" : standing.kind === 'ambiguous' ? "You're on more than one roster" : "Your team wasn't found";
    return (
      <>
        <dt className="text-slate-500">Standings</dt>
        <dd className="text-amber-300">{text}</dd>
      </>
    );
  }
  const s = standing;
  return (
    <>
      <dt className="text-slate-500">Standings</dt>
      <dd className="text-slate-200">
        {s.record} · <strong className="text-slate-50">{s.place}/{s.teams}</strong>
        {s.gamesPlayed === 0 && <span className="text-slate-500"> (no games yet)</span>}
      </dd>
      <dt className="text-slate-500">Points for</dt>
      <dd className="text-slate-200">
        <span className="tabular-nums">{pts(s.pointsFor)}</span> · <strong className="text-slate-50">{s.pointsForRank}/{s.teams}</strong>
      </dd>
      <dt className="text-slate-500">League high</dt>
      <dd className="text-slate-200">
        <span className="tabular-nums">{pts(s.leagueHighPointsFor)}</span> PF{s.ownerHasHigh && <span className="text-emerald-300"> (you)</span>}
      </dd>
    </>
  );
}
