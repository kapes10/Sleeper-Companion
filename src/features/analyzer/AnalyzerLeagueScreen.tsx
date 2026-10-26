// Team Analyzer results for ONE league, calculated when the screen opens. The calculations live in
// src/analysis (no UI code there); this file only loads data and displays the results.
import { useCallback, type ReactNode } from 'react';
import type { SleeperLeague, SleeperLeagueUser, SleeperRoster, SleeperTransaction } from '../../api/types';
import { analyzeLeague, TIER_ORDER, type Confidence, type LeagueAnalysis, type TeamAnalysis, type Tier } from '../../analysis/tiers';
import { recommendStance, type StanceResult } from '../../analysis/stance';
import { formatRecord, type TeamRecord } from '../../analysis/standings';
import { teamFcContext, type TeamFcContext } from '../../analysis/fcContext';
import { FantasyCalcAttribution } from '../../components/Attribution';
import { Button, ErrorMessage, Loading, Notice, Screen, formatTime } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { summarizeLeague } from '../../domain/league';
import { findOwnerRoster, teamName } from '../../domain/roster';
import type { PlayerIndex } from '../../domain/players';
import { useServices } from '../../services';
import type { SavedAccount } from '../../storage/prefs';
import { describeParams } from '../../valuations/fantasycalc/params';
import { selectFcSet } from '../../valuations/leagueValues';
import { matchValues } from '../../valuations/match';
import type { SetState } from '../../valuations/fantasycalc/refresh';
import { fcFreshness, formatAge } from '../../valuations/staleness';
import { analyzePositions, type LeaguePositional } from '../../analysis/positional/positional';
import { lookFor } from '../../analysis/positional/lookFor';
import { LookForSection, PositionalLine, PositionalOverview, PositionalUnavailable, TeamProfileToggle } from './Positional';

/** Weeks of transactions fetched for "recent trades" (the current week and the two before it). */
const RECENT_WEEKS = 3;

export const TIER_LABELS: Record<Tier, { title: string; blurb: string }> = {
  contender: { title: 'Contenders', blurb: 'Likely buyers: safely in a playoff spot and scoring well.' },
  bubble: { title: 'Bubble', blurb: 'Near the playoff line: could go either way.' },
  seller: { title: 'Sellers', blurb: 'Likely sellers: out of a playoff spot and beyond reach.' },
  deep_rebuild: { title: 'Deep Rebuild', blurb: 'Far out of the race with a young roster or extra picks.' },
};

const LOGIC_TEXT = {
  dynasty: 'Dynasty logic: standings decide the tier; roster age and future picks can mark a far-out team as a Deep Rebuild.',
  keeper: 'Keeper logic (same as dynasty): standings decide the tier; roster age and future picks can mark a far-out team as a Deep Rebuild.',
  redraft: 'Redraft logic: tiers come from the playoff race only. Age and draft picks are not used, and there is no Deep Rebuild tier.',
};

interface Loaded {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  players: PlayerIndex;
  analysis: LeagueAnalysis;
  fetchedAt: number;
}

export function AnalyzerLeagueScreen({ account, leagueId }: { account: SavedAccount; leagueId: string }) {
  const services = useServices();
  const load = useCallback(
    async (force: boolean): Promise<Loaded> => {
      const c = <T,>(key: string, fn: () => Promise<T>) => services.cached(key, fn, force);
      const nfl = await c('state:nfl', () => services.api.getNflState());
      const week = nfl.data.week;
      const weeks = Array.from({ length: RECENT_WEEKS }, (_, i) => week - i).filter((w) => w >= 1);
      const [league, rosters, users, picks, players, ...tx] = await Promise.all([
        c(`league:${leagueId}`, () => services.api.getLeague(leagueId)),
        c(`rosters:${leagueId}`, () => services.api.getRosters(leagueId)),
        c(`users:${leagueId}`, () => services.api.getLeagueUsers(leagueId)),
        c(`traded-picks:${leagueId}`, () => services.api.getTradedPicks(leagueId)),
        services.players(),
        ...weeks.map((w) => c(`transactions:${leagueId}:${w}`, () => services.api.getTransactions(leagueId, w))),
      ]);
      if (!league.data) throw new Error('Sleeper has no league with this ID.');
      const analysis = analyzeLeague({
        league: league.data,
        rosters: rosters.data,
        tradedPicks: picks.data,
        recentTransactions: tx.flatMap((t) => t.data as SleeperTransaction[]),
        players: players.players,
        currentWeek: week,
      });
      return { league: league.data, rosters: rosters.data, users: users.data, players: players.players, analysis, fetchedAt: rosters.fetchedAt };
    },
    [services, leagueId],
  );
  const { state, reload } = useAsync(`analyzer:${leagueId}`, load);
  const data = state.data;
  const fc = useFcContext(data);
  const summary = data && summarizeLeague(data.league);

  return (
    <Screen
      title={summary?.name ?? 'Team Analyzer'}
      subtitle={summary && `${summary.format} · ${summary.teams} teams`}
      actions={
        <Button
          onClick={() => {
            reload();
            fc.reload();
          }}
          disabled={state.status === 'loading'}
          aria-label="Refresh analysis"
        >
          Refresh
        </Button>
      }
    >
      <a href="#/analyzer" className="mb-4 inline-flex min-h-11 items-center text-sm text-emerald-400 hover:text-emerald-300">
        ← Team Analyzer
      </a>
      <div className="space-y-4">
        {state.status === 'loading' && <Loading label={data ? 'Refreshing…' : 'Analyzing this league…'} />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't analyze this league" onRetry={reload} />}
        {data && <Results data={data} account={account} fc={fc.state.data ?? null} fcError={fc.state.status === 'error'} />}
      </div>
    </Screen>
  );
}

/** FantasyCalc context loads separately so a values problem never blocks the analysis. */
function useFcContext(data: Loaded | undefined) {
  const services = useServices();
  const load = useCallback(
    async (force: boolean): Promise<FcLoaded> => {
      const { data: index } = await services.fcIndex(force);
      const sel = selectFcSet(data!.league, index);
      const base = { league: data!.league, rosters: data!.rosters, players: data!.players };
      if (sel.kind !== 'available') {
        const why = sel.kind === 'missing' ? "No FantasyCalc values have been published for this league's format yet." : "This league's settings can't be matched to FantasyCalc values.";
        return { kind: sel.kind, positional: analyzePositions({ ...base, values: null, valuesMissingReason: why }) };
      }
      const snap = await services.fcSnapshot(sel.state.latest!);
      const values = matchValues(snap.rows, data!.players).bySleeperId;
      const byRoster = new Map<number, TeamFcContext>();
      for (const r of data!.rosters) {
        const team = data!.analysis.teams?.find((t) => t.rosterId === r.roster_id);
        byRoster.set(r.roster_id, teamFcContext(r, values, team?.futurePicks ?? null, snap.picks));
      }
      const positional = analyzePositions({ ...base, values });
      return { kind: 'available', label: describeParams(sel.params), fetchedAt: Date.parse(sel.state.latest!.fetchedAt), state: sel.state, byRoster, positional };
    },
    [services, data],
  );
  return useAsync(data ? `analyzer-fc:${data.league.league_id}:${data.fetchedAt}` : 'analyzer-fc:none', (force) =>
    data ? load(force) : new Promise<never>(() => {}),
  );
}

type FcLoaded =
  | { kind: 'available'; label: string; fetchedAt: number; state: SetState; byRoster: Map<number, TeamFcContext>; positional: LeaguePositional }
  /** No FantasyCalc snapshot for this league's format, or the format can't be mapped. */
  | { kind: 'missing' | 'unsupported'; positional: LeaguePositional };
type FcState = FcLoaded | null;

function Results({ data, account, fc, fcError }: { data: Loaded; account: SavedAccount; fc: FcState; fcError: boolean }) {
  const { analysis, users } = data;
  const mine = findOwnerRoster(data.rosters, account.userId);
  const myRosterId = mine.kind === 'found' ? mine.roster.roster_id : null;
  const stance = recommendStance(analysis, mine);
  const name = (r: TeamRecord) => teamName(users, r.ownerId) ?? `Team ${r.rosterId} (no owner)`;
  const fcFor = (rosterId: number) => (fc && fc.kind === 'available' ? (fc.byRoster.get(rosterId) ?? null) : null);
  const positional = fcError ? ({ status: 'unavailable', reason: "FantasyCalc values couldn't be loaded.", unsupportedSlots: [] } as LeaguePositional) : (fc?.positional ?? null);
  const posOk = positional?.status === 'ok' ? positional : null;
  const posFor = (rosterId: number) => posOk?.teams.find((t) => t.rosterId === rosterId) ?? null;
  const nameById = (rosterId: number) => {
    const r = analysis.standings.find((x) => x.rosterId === rosterId);
    return r ? name(r) : `Team ${rosterId}`;
  };
  const myLookFor = lookFor(stance, positional, myRosterId !== null ? posFor(myRosterId) : null);

  return (
    <>
      <Notice>
        <strong>These are estimates</strong> inferred from records, points, roster ages and draft picks. They are not anyone's stated plans.
      </Notice>
      <YourTeamCard stance={stance}>
        <LookForSection lookFor={myLookFor} />
        {myRosterId !== null && posOk && posFor(myRosterId) && <TeamProfileToggle team={posFor(myRosterId)!} teamName="your team" />}
      </YourTeamCard>
      <p className="text-xs text-slate-500">
        Sleeper data loaded {formatTime(data.fetchedAt)} · {analysis.season.weeksScored} of {analysis.season.regularWeeks ?? '?'} regular-season weeks played ·{' '}
        {analysis.season.gamesRemaining} games left per team
      </p>

      {analysis.teams === null ? (
        <>
          <Notice tone="warn">{analysis.noTiersReason}</Notice>
          <StandingsTable standings={analysis.standings} name={name} myRosterId={myRosterId} />
          <FcLegend fc={fc} fcError={fcError} />
          <PositionalUnavailable positional={positional} />
          {posOk && (
            <>
              <PositionalOverview positional={posOk} name={nameById} />
              <section aria-label="Team profiles" className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Team profiles</h2>
                <ul className="space-y-2">
                  {posOk.teams.map((t) => (
                    <li key={t.rosterId} className="rounded-xl bg-slate-900 p-3 text-sm" aria-label={`Team ${nameById(t.rosterId)}`}>
                      <p className="text-slate-100">{nameById(t.rosterId)}</p>
                      <PositionalLine team={t} />
                      <TeamProfileToggle team={t} teamName={nameById(t.rosterId)} />
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      ) : (
        <>
          <FcLegend fc={fc} fcError={fcError} />
          <PositionalUnavailable positional={positional} />
          {posOk && <PositionalOverview positional={posOk} name={nameById} />}
          {TIER_ORDER.filter((t) => analysis.logic !== 'redraft' || t !== 'deep_rebuild').map((tier) => {
            const teams = analysis.teams!.filter((t) => t.tier === tier);
            return (
              <section key={tier} aria-label={TIER_LABELS[tier].title}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                  {TIER_LABELS[tier].title} <span className="text-slate-600">({teams.length})</span>
                </h2>
                <p className="mb-2 text-xs text-slate-500">{TIER_LABELS[tier].blurb}</p>
                {teams.length === 0 ? (
                  <p className="rounded-xl bg-slate-900 px-3 py-3 text-sm text-slate-500">No teams</p>
                ) : (
                  <ul className="space-y-2">
                    {teams.map((t) => (
                      <TeamCard key={t.rosterId} team={t} name={name(t.record)} isMine={t.rosterId === myRosterId} fc={fcFor(t.rosterId)}>
                        {posOk && posFor(t.rosterId) && (
                          <>
                            <PositionalLine team={posFor(t.rosterId)!} />
                            <TeamProfileToggle team={posFor(t.rosterId)!} teamName={name(t.record)} />
                          </>
                        )}
                      </TeamCard>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {analysis.excluded.length > 0 && (
            <section aria-label="Not sorted into a tier">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Not sorted into a tier</h2>
              <ul className="space-y-2">
                {analysis.excluded.map((e) => (
                  <li key={e.rosterId} className="rounded-xl bg-slate-900 p-3 text-sm">
                    <p className="text-slate-100">
                      {name(e.record)} · {formatRecord(e.record)}
                    </p>
                    <p className="text-xs text-slate-400">{e.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <HowCalculated analysis={analysis} />
    </>
  );
}

const CONF_STYLE: Record<Confidence, string> = {
  high: 'bg-emerald-900 text-emerald-200',
  medium: 'bg-amber-900 text-amber-200',
  low: 'bg-slate-700 text-slate-200',
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${CONF_STYLE[confidence]}`}>{confidence[0]!.toUpperCase() + confidence.slice(1)} confidence</span>;
}

function YourTeamCard({ stance, children }: { stance: StanceResult; children?: ReactNode }) {
  const tier = stance.team ? TIER_LABELS[stance.team.tier].title : null;
  return (
    <section aria-label="Your team" className="space-y-2 rounded-xl border border-emerald-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Your team</h2>
        {stance.team && <ConfidenceBadge confidence={stance.team.confidence} />}
      </div>
      {tier && <p className="text-sm text-slate-300">Tier: <strong className="text-slate-50">{tier}</strong></p>}
      <p className="text-lg font-semibold text-slate-50">{stance.kind === 'recommendation' ? `Suggested stance: ${stance.headline}` : stance.headline}</p>
      {stance.reasons.filter(Boolean).length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
          {stance.reasons.filter(Boolean).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

function TeamCard({ team, name, isMine, fc, children }: { team: TeamAnalysis; name: string; isMine: boolean; fc: TeamFcContext | null; children?: ReactNode }) {
  const r = team.record;
  const context = [
    team.ageMedian !== null ? `Median age ${team.ageMedian}` : null,
    team.netPicks12 !== null ? `Future 1st/2nds via trades: ${team.netPicks12 > 0 ? '+' : ''}${team.netPicks12}` : null,
    `${team.recentTrades} trade${team.recentTrades === 1 ? '' : 's'} in the last ${RECENT_WEEKS} weeks`,
  ].filter(Boolean);
  return (
    <li className={`rounded-xl bg-slate-900 p-3 ${isMine ? 'ring-1 ring-emerald-600' : ''}`} aria-label={`Team ${name}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words font-medium text-slate-50">
          {name}
          {isMine && <span className="ml-1 text-xs text-emerald-300">(you)</span>}
        </p>
        <ConfidenceBadge confidence={team.confidence} />
      </div>
      <p className="text-xs text-slate-400">
        #{r.rank} · {formatRecord(r)} · PF {r.pf.toFixed(1)} · PA {r.pa.toFixed(1)}
      </p>
      <p className="mt-1 text-sm text-slate-200">{team.reason}</p>
      {children}
      <p className="mt-1 text-xs text-slate-500">{context.join(' · ')}</p>
      {fc && (
        <p className="mt-1 text-xs text-slate-500">
          FantasyCalc context: roster {fc.rosterValue.toLocaleString()} ({fc.playersValued}/{fc.playersTotal} players valued)
          {fc.pickValue !== null && ` · future picks ${fc.pickValue.toLocaleString()} (${fc.picksValued}/${fc.picksTotal} picks valued)`}
        </p>
      )}
      <details className="mt-1 text-xs text-slate-400">
        <summary className="cursor-pointer py-1 text-slate-300">Why this tier</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {team.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function FcLegend({ fc, fcError }: { fc: FcState; fcError: boolean }) {
  const services = useServices();
  const fresh = fc?.kind === 'available' ? fcFreshness(fc.state, services.now()) : null;
  let text: ReactNode;
  if (fcError) text = "FantasyCalc context couldn't be loaded. Tiers are unaffected.";
  else if (!fc) text = 'Loading FantasyCalc context…';
  else if (fc.kind !== 'available') text = "No FantasyCalc values for this league's format, so roster and pick values aren't shown. Tiers are unaffected.";
  else
    text = (
      <>
        FantasyCalc values ({fc.label}, snapshot {formatTime(fc.fetchedAt)}) are <strong>used for the positional market-value analysis</strong> (display-only) and shown as roster and pick context. They are <strong>not used</strong> to decide tiers or your stance. Pick values use FantasyCalc's plain per-round value.
      </>
    );
  return (
    <div className="space-y-1 rounded-xl bg-slate-900 p-3 text-xs text-slate-400">
      <p>{text}</p>
      {fresh?.kind === 'stale' && (
        <Notice tone="warn">
          These values are {formatAge(fresh.ageMs)} old (refreshes normally happen every 3–4 hours).
          {fresh.lastAttemptFailed && fresh.lastError && ` The latest refresh failed: ${fresh.lastError}`}
        </Notice>
      )}
      <FantasyCalcAttribution />
    </div>
  );
}

function StandingsTable({ standings, name, myRosterId }: { standings: TeamRecord[]; name: (r: TeamRecord) => string; myRosterId: number | null }) {
  return (
    <section aria-label="Standings" className="overflow-x-auto rounded-xl bg-slate-900 p-3">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Team</th>
            <th className="py-1 pr-2">Record</th>
            <th className="py-1 pr-2">PF</th>
            <th className="py-1">PA</th>
          </tr>
        </thead>
        <tbody className="text-slate-200">
          {standings.map((r) => (
            <tr key={r.rosterId} className={`border-t border-slate-800 ${r.rosterId === myRosterId ? 'text-emerald-300' : ''}`}>
              <td className="py-1 pr-2">{r.rank}</td>
              <td className="py-1 pr-2">{name(r)}</td>
              <td className="py-1 pr-2">{formatRecord(r)}</td>
              <td className="py-1 pr-2">{r.pf.toFixed(1)}</td>
              <td className="py-1">{r.pa.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HowCalculated({ analysis }: { analysis: LeagueAnalysis }) {
  const s = analysis.season;
  return (
    <details className="rounded-xl bg-slate-900 p-3 text-sm text-slate-300">
      <summary className="cursor-pointer text-slate-200">How this was calculated</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
        {analysis.logic && <li>{LOGIC_TEXT[analysis.logic]}</li>}
        <li>
          {s.playoffTeams ?? '?'} playoff spots; regular season ends before week {s.playoffWeekStart ?? '?'}; {s.weeksScored} weeks played, {s.weeksRemaining} left
          {s.gamesPerWeek === 2 ? ' (2 games a week, counting the league median)' : ''}.
        </li>
        {analysis.teams && (
          <li>
            Within reach = up to {Math.round(analysis.reach * 10) / 10} games back. Far out = at least {Math.round(analysis.farOut * 10) / 10} games back.
          </li>
        )}
        {analysis.leagueMedianAge !== null && <li>League median team age: {analysis.leagueMedianAge}.</li>}
        <li>
          Confidence: Low with 1–2 weeks played, at most Medium with 3–4; after that High if a team is at least 1 game past the line that decided its tier, Medium for 0.5–1 game, Low if closer or a
          tiebreaker decides it.
        </li>
        <li>Trade deadline: {s.tradeDeadline === null ? 'none set' : `week ${s.tradeDeadline}${s.deadlinePassed ? ' (passed)' : ''}`}.</li>
        {analysis.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </details>
  );
}
