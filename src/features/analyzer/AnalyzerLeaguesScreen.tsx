import { useCallback } from 'react';
import { MainTabs } from '../../components/MainTabs';
import { Button, ErrorMessage, Loading, Notice, Screen } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { useServices } from '../../services';
import type { SavedAccount } from '../../storage/prefs';
import { loadMyLeagues } from '../leagues/loadLeagues';

export function AnalyzerLeaguesScreen({ account }: { account: SavedAccount }) {
  const services = useServices();
  const load = useCallback((force: boolean) => loadMyLeagues(services, account, force), [services, account]);
  const { state, reload } = useAsync(`analyzer-leagues:${account.userId}`, load);
  const data = state.data;

  return (
    <Screen
      title="Team Analyzer"
      subtitle="Pick a league to sort its teams into likely buyers and sellers."
      actions={
        <Button onClick={reload} disabled={state.status === 'loading'} aria-label="Refresh leagues">
          Refresh
        </Button>
      }
    >
      <MainTabs active="analyzer" />
      <div className="space-y-3">
        {state.status === 'loading' && <Loading label={data ? 'Refreshing…' : 'Loading your leagues…'} />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't load your leagues" onRetry={reload} />}
        {data && data.leagues.length === 0 && <Notice>No NFL leagues found for the {data.season} season on this account.</Notice>}
        <ul className="space-y-2">
          {data?.leagues.map((l) => (
            <li key={l.id}>
              <a
                href={`#/analyzer/${l.id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <span className="min-w-0">
                  <span className="block break-words font-medium text-slate-50">{l.name}</span>
                  <span className="block text-xs text-slate-400">
                    {l.format} · {l.teams} teams
                  </span>
                </span>
                <span aria-hidden className="text-emerald-400">
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}
