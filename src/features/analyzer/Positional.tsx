// Display of the positional MARKET-VALUE analysis (Stage 4). All calculations live in
// src/analysis/positional; nothing here affects tiers or the stance.
import { useState, type ReactNode } from 'react';
import { ANALYZED_POSITIONS, type Position } from '../../analysis/positional/slots';
import { positionalSummary, type LeaguePositional, type LineupEntry, type PlayerRef, type PositionLabel, type TeamPositional } from '../../analysis/positional/positional';
import type { LookFor } from '../../analysis/positional/lookFor';
import { slotLabel } from '../../domain/roster';
import { FantasyCalcAttribution } from '../../components/Attribution';
import { Notice } from '../../components/ui';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Required on every view that shows positional market value. */
export function MarketValueNote() {
  return (
    <p className="rounded-lg border border-sky-900 bg-sky-950/40 px-3 py-2 text-xs text-sky-200">
      <strong>Market value, not projected production.</strong> Based on FantasyCalc trade prices. Not on-field strength, projected points or a start/sit recommendation.
    </p>
  );
}

const LABEL_TEXT: Record<PositionLabel, string> = { strong: 'Strong', adequate: 'Adequate', need: 'Need', surplus: 'Surplus', withheld: 'Not enough data' };
const LABEL_STYLE: Record<PositionLabel, string> = {
  strong: 'bg-emerald-900 text-emerald-200',
  adequate: 'bg-slate-700 text-slate-200',
  need: 'bg-rose-900 text-rose-200',
  surplus: 'bg-sky-900 text-sky-200',
  withheld: 'bg-slate-800 text-slate-400',
};

export function LabelBadge({ label, lowConfidence }: { label: PositionLabel; lowConfidence?: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${LABEL_STYLE[label]}`}>
      {LABEL_TEXT[label]}
      {lowConfidence ? ' (low confidence)' : ''}
    </span>
  );
}

/** One line for a tier-list card, e.g. "Market value: thin at RB · surplus at WR". */
export function PositionalLine({ team }: { team: TeamPositional }) {
  const summary = positionalSummary(team);
  return <p className="mt-1 text-xs text-sky-300">Market value: {summary ?? 'no clear needs or surpluses'}</p>;
}

export function PositionalUnavailable({ positional }: { positional: LeaguePositional | null }) {
  if (!positional) return <p className="text-xs text-slate-500">Loading positional market value…</p>;
  if (positional.status === 'ok') return null;
  return <Notice tone="warn">Positional market value: {positional.reason}</Notice>;
}

/** League-wide: per position, the teams with the most and least market value. */
export function PositionalOverview({ positional, name }: { positional: LeaguePositional; name: (rosterId: number) => string }) {
  if (positional.status !== 'ok') return null;
  return (
    <section aria-label="Positional market value overview" className="space-y-2 rounded-xl bg-slate-900 p-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Positional market value</h2>
      <MarketValueNote />
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 pr-2">Pos</th>
            <th className="py-1 pr-2">Most value</th>
            <th className="py-1">Thinnest</th>
          </tr>
        </thead>
        <tbody className="text-slate-200">
          {ANALYZED_POSITIONS.map((pos) => (
            <tr key={pos} className="border-t border-slate-800 align-top">
              <td className="py-1 pr-2 font-semibold">{pos}</td>
              <td className="py-1 pr-2">{positional.overview[pos].strongest.map(name).join(', ')}</td>
              <td className="py-1">{positional.overview[pos].thinnest.map(name).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500">Ranked by the market value of each team's market-value lineup at that position ({positional.activeTeams} active teams).</p>
      {ANALYZED_POSITIONS.some((pos) => positional.overview[pos].compared < positional.activeTeams) && (
        <p className="text-xs text-amber-300">
          Teams with enough data to compare:{' '}
          {ANALYZED_POSITIONS.map((pos) => `${pos} ${positional.overview[pos].compared} of ${positional.activeTeams}`).join(' · ')}. Teams missing a key value at a position are left out there.
        </p>
      )}
      <FantasyCalcAttribution />
    </section>
  );
}

export function LookForSection({ lookFor }: { lookFor: LookFor }) {
  return (
    <div className="space-y-2 border-t border-slate-800 pt-2" aria-label="What to look for">
      <h3 className="text-sm font-semibold text-slate-200">What to look for</h3>
      <MarketValueNote />
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
        {lookFor.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

/** Expandable team profile: both lineups, value by position with rank, needs/surpluses, groups, notes. */
export function TeamProfileToggle({ team, teamName }: { team: TeamPositional; teamName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="min-h-11 text-left text-xs font-medium text-sky-300 hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        {open ? '▾ Hide team profile' : '▸ Team profile (market value)'}
      </button>
      {open && <TeamProfile team={team} teamName={teamName} />}
    </div>
  );
}

function PlayerLine({ p, children }: { p: PlayerRef; children?: ReactNode }) {
  return (
    <span>
      {p.name}
      <span className="text-slate-500">
        {' '}
        {p.sleeperPosition ?? '—'}
        {p.team ? ` · ${p.team}` : ''}
      </span>{' '}
      {p.value === null ? <span className="italic text-amber-300">no value</span> : <span className="tabular-nums text-slate-300">{fmt(p.value)}</span>}
      {p.injury && <span className="ml-1 text-amber-300">({p.injury})</span>}
      {children}
    </span>
  );
}

function LineupList({ title, subtitle, entries }: { title: string; subtitle: string; entries: LineupEntry[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <ul className="mt-1 divide-y divide-slate-800 rounded-lg bg-slate-950">
        {entries.map((e, i) => (
          <li key={`${e.slot}-${i}`} className="flex gap-2 px-2 py-1 text-xs">
            <span className="w-10 shrink-0 font-semibold text-slate-400">{slotLabel(e.slot)}</span>
            {e.player ? <PlayerLine p={e.player} /> : <span className="italic text-slate-500">Empty</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamProfile({ team, teamName }: { team: TeamPositional; teamName: string }) {
  const unvaluedActive = team.unvalued.length;
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-slate-800 p-2" aria-label={`Profile ${teamName}`}>
      <MarketValueNote />
      <p className="text-xs text-slate-400">
        Data: {unvaluedActive} of {team.rostered} rostered players have no FantasyCalc value. They're left out of totals, not counted as zero.
      </p>

      <table className="w-full text-left text-xs" aria-label="Value by position">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 pr-1">Pos</th>
            <th className="py-1 pr-1">Market value</th>
            <th className="py-1 pr-1">Rank</th>
            <th className="py-1 pr-1">Label</th>
            <th className="py-1">Valued</th>
          </tr>
        </thead>
        <tbody className="text-slate-200">
          {ANALYZED_POSITIONS.map((pos) => {
            const r = team.positions[pos];
            return (
              <tr key={pos} className="border-t border-slate-800">
                <td className="py-1 pr-1 font-semibold">{pos}</td>
                <td className="py-1 pr-1 tabular-nums">{fmt(r.value)}</td>
                <td className="py-1 pr-1">{r.rank === null ? '—' : `#${r.rank} of ${r.compared}`}</td>
                <td className="py-1 pr-1">
                  <LabelBadge label={r.label} lowConfidence={r.lowConfidence} />
                </td>
                <td className="py-1 tabular-nums">
                  {r.activeCount - r.unvaluedCount}/{r.activeCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {ANALYZED_POSITIONS.map((pos) => team.positions[pos].note && <p key={pos} className="text-xs text-amber-300">{pos}: {team.positions[pos].note}</p>)}

      <div className="space-y-1 text-xs text-slate-300">
        {team.needs.map((pos: Position) => (
          <p key={`need-${pos}`}>
            <LabelBadge label="need" /> {pos} (#{team.positions[pos].rank} of {team.positions[pos].compared} compared): lineup {pos}s{' '}
            {team.positions[pos].lineupPlayers.length ? team.positions[pos].lineupPlayers.map((p) => `${p.name} ${p.value === null ? 'no value' : fmt(p.value)}`).join(', ') : 'none'}.
          </p>
        ))}
        {team.surpluses.map((pos: Position) => (
          <p key={`surplus-${pos}`}>
            <LabelBadge label="surplus" /> {pos}: {team.positions[pos].surplus.map((p) => `${p.name} ${fmt(p.value!)}`).join(', ')}. Kept as depth:{' '}
            {team.positions[pos].depth.map((p) => p.name).join(', ') || 'none'}.
          </p>
        ))}
        {!team.needs.length && !team.surpluses.length && <p>No needs or surpluses flagged.</p>}
      </div>

      <LineupList title="Sleeper's current starters" subtitle="Exactly as stored in Sleeper." entries={team.sleeperStarters} />
      <LineupList
        title="Market-value lineup (estimate)"
        subtitle="Analytical estimate: the roster's highest total FantasyCalc value that fits the league's slots. Not a weekly lineup recommendation."
        entries={team.marketLineup}
      />

      {(team.stashed.ir.length > 0 || team.stashed.taxi.length > 0) && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stashed (not in lineup)</h4>
          <p className="text-xs text-slate-500">IR and taxi players are roster assets but can't fill lineup slots, so they don't count toward position value.</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
            {team.stashed.ir.map((p) => (
              <li key={`ir-${p.id}`}>
                IR · <PlayerLine p={p} />
              </li>
            ))}
            {team.stashed.taxi.map((p) => (
              <li key={`tx-${p.id}`}>
                Taxi · <PlayerLine p={p} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {team.notAnalyzed.length > 0 && <p className="text-xs text-slate-500">Not analyzed (no QB/RB/WR/TE eligibility): {team.notAnalyzed.map((p) => p.name).join(', ')}.</p>}

      {team.injuries.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Injury notes</h4>
          <p className="text-xs text-slate-500">From Sleeper (up to a day old). Shown as notes only; values are not adjusted.</p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-200">
            {team.injuries.map((p) => (
              <li key={`inj-${p.id}`}>
                {p.name}: {p.injury}
              </li>
            ))}
          </ul>
        </div>
      )}
      <FantasyCalcAttribution />
    </div>
  );
}
