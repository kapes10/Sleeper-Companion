// Shared pieces for the lineup manager screens: badges, the device-only note and the saved-item card.
import type { ReactNode } from 'react';
import type { Finding } from '../../analysis/lineup/placement';
import { CACHE_NOTE, checkable, latestCheckText, WORKFLOW_BADGE, workflowCheck, type ItemFinding, type LineupItem, type Workflow } from '../../analysis/lineup/verify';
import { Button, formatTime } from '../../components/ui';
import { sleeperLeagueUrl } from './loadLineups';

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue';
const TONES: Record<Tone, string> = {
  green: 'border-emerald-700 bg-emerald-950/60 text-emerald-200',
  amber: 'border-amber-700 bg-amber-950/60 text-amber-100',
  red: 'border-red-700 bg-red-950/60 text-red-100',
  gray: 'border-slate-600 bg-slate-800 text-slate-200',
  blue: 'border-sky-700 bg-sky-950/60 text-sky-100',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

const WORKFLOW_TONE: Record<Workflow, Tone> = { pending: 'amber', verified: 'green', changed: 'blue', done_unverified: 'amber', expired: 'gray' };
export const WorkflowBadge = ({ workflow }: { workflow: Workflow }) => <Badge tone={WORKFLOW_TONE[workflow]}>{WORKFLOW_BADGE[workflow]}</Badge>;

export function findingLabel(f: Pick<Finding, 'kind'> & { code?: string }): string {
  switch (f.kind) {
    case 'available':
      return 'Bench option available';
    case 'none':
      return 'No bench option';
    case 'uncertain':
      return "Can't tell";
    case 'info':
      return f.code === 'bestball' ? 'Information only: best ball' : f.code === 'unknown_type' ? 'Information only: league type not set' : 'Information only';
  }
}
const FINDING_TONE: Record<Finding['kind'], Tone> = { available: 'green', none: 'gray', info: 'gray', uncertain: 'amber' };
export const FindingBadge = ({ finding }: { finding: Pick<Finding, 'kind'> & { code?: string } }) => <Badge tone={FINDING_TONE[finding.kind]}>{findingLabel(finding)}</Badge>;

export function DeviceOnlyNote() {
  return (
    <p className="text-xs text-slate-400">
      Saved on this device only: league types and your checklist live in this browser and don't sync to your other devices. Nothing is ever sent to Sleeper.
    </p>
  );
}

export function NothingChangedNote() {
  return <p className="text-sm font-medium text-amber-100">Nothing has been changed in Sleeper. You make each change yourself in Sleeper; this app only reads Sleeper's data.</p>;
}

export function OpenInSleeper({ leagueId, onOpen }: { leagueId: string; onOpen?: () => void }) {
  return (
    <a
      href={sleeperLeagueUrl(leagueId)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className="inline-flex min-h-11 items-center rounded-lg bg-slate-800 px-4 text-sm font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      Open in Sleeper ↗
    </a>
  );
}

export const LinkNote = () => <p className="text-xs text-slate-500">Opens the league page on sleeper.com (not the lineup screen directly). Tested on desktop; on phones, not yet confirmed.</p>;

function FindingLine({ finding }: { finding: ItemFinding | null }) {
  if (!finding) return null;
  return (
    <p className="text-sm text-slate-300">
      <span className="text-slate-400">Finding: </span>
      <FindingBadge finding={finding} /> {finding.reason}
    </p>
  );
}

/** One saved plan: workflow badge, reason, what to check, latest check, finding, and actions. */
export function ItemCard({
  item,
  busy,
  onCheck,
  onDone,
  onOpen,
  onRemove,
}: {
  item: LineupItem;
  busy: boolean;
  onCheck: () => void;
  onDone: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const c = item.latestCheck;
  return (
    <li aria-label={`Plan in ${item.leagueName}`} className="space-y-2 rounded-xl bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-words text-slate-50">{item.leagueName}</span>
        <WorkflowBadge workflow={item.workflow} />
      </div>
      <p className="text-sm text-slate-300">
        Plan: <strong>{item.outgoing.name}</strong> out, <strong>{item.replacement.name}</strong> in at {item.slot === 'SUPER_FLEX' ? 'SUPER_FLEX (SF)' : item.slot} · week {item.week}
      </p>
      <p className="text-sm text-slate-200">{item.workflowReason}</p>
      {item.facts.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-slate-300">
          {item.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {item.note && <p className="text-sm text-slate-300">Note: {item.note}</p>}
      <p className="text-sm text-slate-300">
        <span className="text-slate-400">What to check in Sleeper: </span>
        {workflowCheck(item)}
      </p>
      <p className={`text-sm ${c.kind === 'failed' ? 'rounded-md border border-red-800 bg-red-950/50 p-2 text-red-100' : 'text-slate-300'}`} role={c.kind === 'failed' ? 'alert' : undefined}>
        <span className={c.kind === 'failed' ? 'font-semibold' : 'text-slate-400'}>Latest check: </span>
        {latestCheckText(c, formatTime)}
        {c.kind === 'ok' && <span className="block text-xs text-slate-500">{CACHE_NOTE}</span>}
      </p>
      <FindingLine finding={item.finding} />
      {item.doneMarkedAt && <p className="text-xs text-slate-500">You marked this done at {formatTime(item.doneMarkedAt)}.</p>}
      {item.openedAt && <p className="text-xs text-slate-500">You opened Sleeper from here at {formatTime(item.openedAt)} (information only; it doesn't change any status).</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {checkable(item) && <OpenInSleeper leagueId={item.leagueId} onOpen={onOpen} />}
        {item.workflow === 'pending' && <Button onClick={onDone}>I've done this</Button>}
        {checkable(item) && (
          <Button onClick={onCheck} disabled={busy} aria-label={`${c.kind === 'failed' ? 'Try again' : 'Check again'}: ${item.leagueName}`}>
            {busy ? 'Checking…' : c.kind === 'failed' ? 'Try again' : 'Check again'}
          </Button>
        )}
        <Button onClick={onRemove} aria-label={`Remove plan in ${item.leagueName}`}>
          Remove
        </Button>
      </div>
    </li>
  );
}
