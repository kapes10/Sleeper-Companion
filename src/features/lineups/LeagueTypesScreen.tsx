import { useCallback, useState } from 'react';
import type { LeagueType } from '../../analysis/lineup/placement';
import { Button, ErrorMessage, Loading, Screen } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { useServices } from '../../services';
import { leagueTypeOf, loadLeagueTypes, saveLeagueTypes } from '../../storage/lineup';
import type { SavedAccount } from '../../storage/prefs';
import { DeviceOnlyNote } from './LineupUi';

const LABEL: Record<LeagueType, string> = { managed: 'Managed', bestball: 'Best ball', unknown: 'Unknown' };
const ORDER: LeagueType[] = ['managed', 'bestball', 'unknown'];

/** Sleeper's own best_ball setting, shown only as a hint (undocumented; never used to set a type). */
function hint(v: unknown): string {
  if (v === 1) return 'Sleeper setting: best ball on (not documented; hint only)';
  if (v === 0) return 'Sleeper setting: best ball off (not documented; hint only)';
  return 'Sleeper setting: not available';
}

export function LeagueTypesScreen({ account }: { account: SavedAccount }) {
  const services = useServices();
  const load = useCallback(
    async (force: boolean) => {
      const state = await services.cached('state:nfl', () => services.api.getNflState(), force);
      const season = state.data.league_season || state.data.season;
      return (await services.cached(`leagues:${account.userId}:${season}`, () => services.api.getUserLeagues(account.userId, season), force)).data;
    },
    [services, account],
  );
  const { state, reload } = useAsync(`league-types:${account.userId}`, load);
  const [types, setTypes] = useState(() => loadLeagueTypes());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const leagues = state.data ?? [];

  const set = (ids: string[], t: LeagueType) => {
    const next = { ...types };
    for (const id of ids) next[id] = t;
    saveLeagueTypes(next);
    setTypes(loadLeagueTypes());
  };
  const counts = ORDER.map((t) => `${leagues.filter((l) => leagueTypeOf(types, l.league_id) === t).length} ${LABEL[t]}`).join(' · ');

  return (
    <Screen title="League types" subtitle="Tell the app how each league's lineups work. Only Managed leagues get replacement suggestions.">
      <p className="mb-3 text-sm">
        <a href="#/lineups" className="text-emerald-400 underline">
          ← Lineup Manager
        </a>
      </p>
      <div className="space-y-3">
        <DeviceOnlyNote />
        <p className="text-sm text-slate-400">You set these yourself; the app never guesses a league's type from its name. Set them once on each device you use.</p>
        {state.status === 'loading' && !state.data && <Loading label="Loading your leagues…" />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't load your leagues" onRetry={reload} />}
        {leagues.length > 0 && (
          <>
            <p className="text-sm text-slate-300" aria-live="polite">
              {counts}
            </p>
            <div role="group" aria-label="Change several leagues" className="space-y-2 rounded-xl bg-slate-900 p-3">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setSelected(new Set(leagues.map((l) => l.league_id)))}>Select all</Button>
                <Button onClick={() => setSelected(new Set(leagues.filter((l) => leagueTypeOf(types, l.league_id) === 'unknown').map((l) => l.league_id)))}>Select Unknown</Button>
                <Button onClick={() => setSelected(new Set())}>Select none</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                Mark {selected.size} selected as:
                {ORDER.map((t) => (
                  <Button key={t} disabled={!selected.size} onClick={() => set([...selected], t)}>
                    {LABEL[t]}
                  </Button>
                ))}
              </div>
            </div>
            <ul className="space-y-2" aria-label="Leagues">
              {leagues.map((l) => {
                const t = leagueTypeOf(types, l.league_id);
                const name = l.name.trim();
                return (
                  <li key={l.league_id} className="space-y-2 rounded-xl bg-slate-900 p-3">
                    <label className="flex min-h-11 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0 accent-emerald-500"
                        checked={selected.has(l.league_id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(l.league_id);
                          else next.delete(l.league_id);
                          setSelected(next);
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium text-slate-50">{name}</span>
                        <span className="block text-xs text-slate-500">{hint(l.settings?.best_ball)}</span>
                      </span>
                    </label>
                    <div role="group" aria-label={`Type for ${name}`} className="flex gap-1 rounded-lg bg-slate-950 p-1">
                      {ORDER.map((o) => (
                        <button
                          key={o}
                          type="button"
                          aria-pressed={t === o}
                          onClick={() => set([l.league_id], o)}
                          className={`min-h-11 flex-1 rounded-md text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${t === o ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
                        >
                          {LABEL[o]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Screen>
  );
}
