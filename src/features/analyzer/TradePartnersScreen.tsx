// Trade partners view (Stage 5): which teams to approach and which assets to consider, for ONE
// league, calculated when opened. All matching logic lives in src/analysis/partners.ts.
// Read-only: nothing is sent to anyone and nothing is written to Sleeper.
import { useCallback, useState } from 'react';
import { LeagueNav } from '../../components/LeagueNav';
import { deadlineLabel, GRADE_TEXT, INFERRED_STANCE, matchPartners, PARTNER_RULES, type AssetGroup, type Candidate, type Partner, type PickLine } from '../../analysis/partners';
import type { PlayerRef, TeamPositional } from '../../analysis/positional/positional';
import { recommendStance } from '../../analysis/stance';
import type { Confidence } from '../../analysis/tiers';
import { FantasyCalcAttribution } from '../../components/Attribution';
import { Button, ErrorMessage, Loading, Notice, Screen } from '../../components/ui';
import { useAsync } from '../../components/useAsync';
import { findOwnerRoster, teamName } from '../../domain/roster';
import { useServices } from '../../services';
import type { SavedAccount } from '../../storage/prefs';
import { loadProtected, saveProtected } from '../../storage/protected';
import { loadAnalyzerData, loadLeagueValues, type AnalyzerData, type LeagueValues } from './loadAnalyzer';
import { TIER_LABELS } from './AnalyzerLeagueScreen';
import { MarketValueNote } from './Positional';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const ORD: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

interface Loaded {
  data: AnalyzerData;
  values: LeagueValues | null;
}

export function TradePartnersScreen({ account, leagueId }: { account: SavedAccount; leagueId: string }) {
  const services = useServices();
  const load = useCallback(
    async (force: boolean): Promise<Loaded> => {
      const data = await loadAnalyzerData(services, leagueId, force);
      // Without values there are no needs or surpluses; that becomes an explanation, not an error screen.
      const values = await loadLeagueValues(services, data, force).catch(() => null);
      return { data, values };
    },
    [services, leagueId],
  );
  const { state, reload } = useAsync(`partners:${leagueId}`, load);
  const [protectedIds, setProtectedIds] = useState(() => loadProtected(leagueId));
  const toggleProtected = (id: string) => {
    const next = new Set(protectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveProtected(leagueId, next);
    setProtectedIds(next);
  };

  const loaded = state.data;
  return (
    <Screen
      title="Trade partners"
      subtitle={loaded?.data.league.name}
      actions={
        <Button onClick={reload} disabled={state.status === 'loading'} aria-label="Refresh trade partners">
          Refresh
        </Button>
      }
    >
      <a href="#/analyzer" className="mb-4 inline-flex min-h-11 items-center text-sm text-emerald-400 hover:text-emerald-300">
        ← Team Analyzer
      </a>
      <LeagueNav leagueId={leagueId} active="partners" />
      <div className="space-y-4">
        {state.status === 'loading' && <Loading label={loaded ? 'Refreshing…' : 'Finding trade partners…'} />}
        {state.status === 'error' && <ErrorMessage error={state.error} title="Couldn't load this league" onRetry={reload} />}
        {loaded && <PartnersBody loaded={loaded} account={account} protectedIds={protectedIds} onToggleProtected={toggleProtected} />}
      </div>
    </Screen>
  );
}

function PartnersBody({ loaded, account, protectedIds, onToggleProtected }: { loaded: Loaded; account: SavedAccount; protectedIds: Set<string>; onToggleProtected: (id: string) => void }) {
  const { data, values } = loaded;
  const mine = findOwnerRoster(data.rosters, account.userId);
  const stance = recommendStance(data.analysis, mine);
  const positional = values?.positional ?? null;
  const nameOf = (rosterId: number) => teamName(data.users, data.rosters.find((r) => r.roster_id === rosterId)?.owner_id ?? null) ?? `Team ${rosterId}`;
  const result = matchPartners({
    league: data.league,
    analysis: data.analysis,
    stance,
    mine,
    positional,
    fcPicks: values?.kind === 'available' ? values.snap.picks : [],
    players: data.players,
    topValue: values?.kind === 'available' ? Math.max(...[...values.values.values()].map((v) => v.raw)) : null,
    protectedIds,
    nameOf,
    currentWeek: data.week,
  });
  const myPos = positional?.status === 'ok' && stance.team ? positional.teams.find((t) => t.rosterId === stance.team!.rosterId) ?? null : null;

  return (
    <>
      <Notice>
        <strong>Estimates based on market value</strong> (FantasyCalc trade prices), not projected production. Tiers and stances are inferred from data, not anyone's stated plans. These are teams and
        assets to <em>consider</em>: not trade proposals, not fairness judgments, and not predictions of what anyone would accept. Nothing is sent to anyone.
      </Notice>
      <MarketValueNote />

      <section aria-label="Your stance" className="space-y-1 rounded-xl border border-emerald-800 bg-slate-900 p-4 text-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Your team</h2>
        {stance.team && (
          <p className="text-slate-300">
            Tier: <strong className="text-slate-50">{TIER_LABELS[stance.team.tier].title}</strong> · <ConfBadge c={stance.team.confidence} />
          </p>
        )}
        <p className="font-semibold text-slate-50">{stance.kind === 'recommendation' ? `Suggested stance: ${stance.headline}` : stance.headline}</p>
        {myPos && (
          <p className="text-xs text-slate-400">
            Needs: {myPos.needs.join(', ') || 'none'} · Surplus: {myPos.surpluses.join(', ') || 'none'} · {myPos.rostered - myPos.unvalued.length} of {myPos.rostered} rostered players have a FantasyCalc
            value
          </p>
        )}
        <p className="text-xs text-slate-400">{deadlineLabel(result.deadline)}</p>
      </section>

      {result.kind === 'explanation' ? (
        <Notice tone="warn">
          <span role="status">{result.reason}</span>
        </Notice>
      ) : (
        <>
          {result.caveat && (
            <div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/60 p-3 text-sm text-amber-100">
              <strong>Low-confidence stance.</strong> {result.caveat}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Order: stance fit first, then positional fit (two-way before one-way), then recent completed trades as a tie-breaker. Teams equal on all three share a position and are listed
            alphabetically. Confidence is a separate label and never changes the order.
          </p>
          <ol className="space-y-3" aria-label="Suggested trade partners">
            {result.partners.map((p) => (
              <PartnerCard key={p.rosterId} p={p} nameOf={nameOf} stance={result.myStance} />
            ))}
          </ol>
          {result.notListed.length > 0 && (
            <details className="rounded-xl bg-slate-900 p-3 text-xs text-slate-400">
              <summary className="cursor-pointer text-slate-300">{result.notListed.length} other team(s) not suggested</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {result.notListed.map((n) => (
                  <li key={n.rosterId}>
                    {nameOf(n.rosterId)}: {n.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {result.excluded.length > 0 && (
        <p className="text-xs text-slate-500">
          Not considered: {result.excluded.map((e) => `${nameOf(e.rosterId)} (${e.reason})`).join('; ')}
        </p>
      )}

      {myPos && <ProtectedPlayers players={allPlayers(myPos)} protectedIds={protectedIds} onToggle={onToggleProtected} />}
      <FantasyCalcAttribution />
    </>
  );
}

/** Every rostered player of the owner, most valuable first (for the protect control). */
function allPlayers(team: TeamPositional): PlayerRef[] {
  const list = [
    ...team.marketLineup.flatMap((e) => (e.player ? [e.player] : [])),
    ...team.bench,
    ...team.stashed.ir,
    ...team.stashed.taxi,
    ...team.notAnalyzed,
  ];
  const seen = new Set<string>();
  return list.filter((p) => !seen.has(p.id) && !!seen.add(p.id)).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

const CONF_STYLE: Record<Confidence, string> = {
  high: 'bg-emerald-900 text-emerald-200',
  medium: 'bg-amber-900 text-amber-200',
  low: 'bg-slate-700 text-slate-200',
};
function ConfBadge({ c, prefix = '' }: { c: Confidence; prefix?: string }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${CONF_STYLE[c]}`}>
      {prefix}
      {c[0]!.toUpperCase() + c.slice(1)} confidence
    </span>
  );
}

/** Short "why this player" tag. */
function whyText(c: Candidate): string {
  const age = c.age === null ? '' : `, age ${c.age}`;
  if (c.why === 'upgrade') return `Upgrade at your need${age}${c.unavailable ? '' : ', starts on their NFL depth chart'}`;
  if (c.why === 'surplus') return `Your surplus at their need${age}`;
  if (c.why === 'young') return `Young (${PARTNER_RULES.youngMaxAge} or under)${age}`;
  return `Veteran (${PARTNER_RULES.veteranMinAge}+)${age}`;
}

function Assets({ title, groups, picks, nameOf, empty }: { title: string; groups: AssetGroup[]; picks: PickLine[]; nameOf: (id: number) => string; empty: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {groups.length === 0 && picks.length === 0 ? (
        <p className="text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs text-slate-200">
          {groups.flatMap((g) =>
            g.players.map((c) => (
              <li key={`${g.position}-${c.player.id}`} className={c.unavailable ? 'opacity-80' : ''}>
                <span className="font-semibold text-slate-400">{g.position}</span> {c.player.name}
                <span className="text-slate-500">{c.player.team ? ` · ${c.player.team}` : ''}</span> <span className="tabular-nums">{fmt(c.player.value!)}</span>
                <span className="text-slate-500"> ({c.player.scaled} on 0–100)</span>
                <span className="block pl-6 text-slate-500">
                  {whyText(c)}
                  {c.player.injury && (
                    <span className="text-amber-300">
                      {' '}
                      · {c.player.injury}
                      {c.unavailable ? ': listed after available players' : ''} (value not adjusted)
                    </span>
                  )}
                </span>
              </li>
            )),
          )}
          {picks.map((l) => (
            <li key={`pick-${l.season}-${l.round}-${l.originalRosterId}`}>
              <span className="font-semibold text-slate-400">PICK</span> {l.season} {ORD[l.round] ?? `${l.round}th`} ({nameOf(l.originalRosterId)}) <span className="tabular-nums">{fmt(l.value!)}</span>
              <span className="block pl-6 text-slate-500">FantasyCalc's plain value for this exact season and round</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Picks({ label, lines, nameOf }: { label: string; lines: PickLine[] | null; nameOf: (id: number) => string }) {
  if (!lines) return <p>{label}: pick holdings unknown (Sleeper didn't provide the number of draft rounds).</p>;
  if (!lines.length) return <p>{label}: no future picks.</p>;
  const total = lines.reduce((s, l) => s + (l.value ?? 0), 0);
  const valued = lines.filter((l) => l.value !== null).length;
  return (
    <p>
      {label}:{' '}
      {lines.map((l, i) => (
        <span key={i}>
          {i ? ', ' : ''}
          {l.season} {ORD[l.round] ?? `${l.round}th`} ({nameOf(l.originalRosterId)}) {l.value === null ? <em>no value</em> : fmt(l.value)}
        </span>
      ))}
      . {valued} of {lines.length} valued{valued ? `, ${fmt(total)} total` : ''}.
    </p>
  );
}

function PartnerCard({ p, nameOf, stance }: { p: Partner; nameOf: (id: number) => string; stance: 'buy' | 'sell' }) {
  const name = nameOf(p.rosterId);
  return (
    <li className="space-y-2 rounded-xl bg-slate-900 p-3" aria-label={`Partner ${name}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words font-medium text-slate-50">
          <span className="text-slate-400">#{p.rank}{p.tied ? ' (tied)' : ''}</span> {name}
        </p>
        <ConfBadge c={p.confidence} />
      </div>
      <p className="text-xs text-slate-400">
        {TIER_LABELS[p.tier].title} ({p.tierConfidence} confidence) · {INFERRED_STANCE[p.tier]} <em>(inferred from their tier, an estimate)</em>
      </p>
      <p className="text-xs font-medium text-sky-300">
        {GRADE_TEXT[p.grade]} · {p.fit === 'two-way' ? 'Two-way fit' : 'One-way fit'}
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-300">
        {p.reasons.slice(1).map((r) => (
          <li key={r}>{r}</li>
        ))}
        {p.recentTrades === 0 && <li>No completed trades in the last 3 weeks (context only).</li>}
      </ul>
      {stance === 'buy' ? (
        <>
          <Assets
            title="Win-now upgrades on their roster (assets to consider)"
            groups={p.targets}
            picks={p.targetPicks}
            nameOf={nameOf}
            empty={`None: no ${PARTNER_RULES.buyTargetMinAge}+ NFL starters at your need positions worth more than your weakest starter there.`}
          />
          <Assets
            title="Your assets they might value: surplus, young players, picks"
            groups={p.offers}
            picks={p.offerPicks}
            nameOf={nameOf}
            empty="None (protected players are never listed)."
          />
        </>
      ) : (
        <>
          <Assets title="Young players and picks on their roster (assets to consider)" groups={p.targets} picks={p.targetPicks} nameOf={nameOf} empty="None that meet the value floor." />
          <Assets title="Your assets they might value: surplus and veterans" groups={p.offers} picks={p.offerPicks} nameOf={nameOf} empty="None (protected players are never listed)." />
        </>
      )}
      <p className="text-xs text-slate-500">
        Only players and picks worth at least {PARTNER_RULES.minScaled} on the 0–100 scale are suggested. Unavailable players (IR, Out, PUP, suspended) are listed last.
      </p>
      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer py-1 text-slate-300">Confidence, data coverage and draft picks</summary>
        <div className="space-y-1">
          {p.confidenceNotes.length > 0 && <p>Confidence lowered because: {p.confidenceNotes.join(' ')}</p>}
          <p>
            FantasyCalc values: you {p.coverage.mine.valued} of {p.coverage.mine.rostered} rostered players; them {p.coverage.theirs.valued} of {p.coverage.theirs.rostered}. Players without a value are
            never listed or ranked.
          </p>
          {p.coverage.positions.map((c) => (
            <p key={c.position}>
              {c.position}: you {c.mine.valued}/{c.mine.rostered} active players valued; them {c.theirs.valued}/{c.theirs.rostered}.
            </p>
          ))}
          <p className="pt-1 font-medium text-slate-300">Draft picks (context only, never suggested as targets or offers)</p>
          <Picks label="Yours" lines={p.picks.mine} nameOf={nameOf} />
          <Picks label="Theirs" lines={p.picks.theirs} nameOf={nameOf} />
          <p>Pick values use FantasyCalc's plain value for that exact season and round; early/mid/late is never guessed. "No value" = no exact match.</p>
        </div>
      </details>
    </li>
  );
}

function ProtectedPlayers({ players, protectedIds, onToggle }: { players: PlayerRef[]; protectedIds: Set<string>; onToggle: (id: string) => void }) {
  const count = players.filter((p) => protectedIds.has(p.id)).length;
  return (
    <details className="rounded-xl bg-slate-900 p-3 text-sm" aria-label="Protected players">
      <summary className="cursor-pointer text-slate-200">
        Protected players ({count}) <span className="text-xs text-slate-500">· saved on this device only</span>
      </summary>
      <p className="mt-1 text-xs text-slate-400">
        Protected players are never listed as assets you might offer. This choice is saved in this browser only: it does <strong>not</strong> sync to your other devices, and nothing is sent to
        Sleeper or other managers.
      </p>
      <ul className="mt-2 divide-y divide-slate-800">
        {players.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 py-1">
            <span className="min-w-0 text-xs text-slate-200">
              {p.name} <span className="text-slate-500">{p.sleeperPosition ?? '—'}</span>{' '}
              {p.value === null ? <em className="text-slate-500">no value</em> : <span className="tabular-nums text-slate-400">{fmt(p.value)}</span>}
            </span>
            <button
              type="button"
              aria-pressed={protectedIds.has(p.id)}
              aria-label={`Protect ${p.name}`}
              onClick={() => onToggle(p.id)}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-xs ${protectedIds.has(p.id) ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-200'}`}
            >
              {protectedIds.has(p.id) ? 'Protected' : 'Protect'}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
