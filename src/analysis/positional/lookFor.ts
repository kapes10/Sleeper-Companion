// "What to look for" lines for the owner's card: top market-value needs and surpluses, tied to
// the (unchanged) stance. Display-only; never changes the stance.
import type { StanceResult } from '../stance';
import type { LeaguePositional, TeamPositional } from './positional';

export const LOOK_FOR_MAX = 2;

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export interface LookFor {
  /** False when the data is too thin to say anything. */
  available: boolean;
  lines: string[];
}

export function lookFor(stance: StanceResult, positional: LeaguePositional | null, mine: TeamPositional | null): LookFor {
  if (!positional) return { available: false, lines: ['Market-value positions are still loading or unavailable.'] };
  if (positional.status !== 'ok') return { available: false, lines: [`Not enough data to say: ${positional.reason}`] };
  if (!mine) return { available: false, lines: ['Not enough data to say: your team could not be analyzed.'] };

  const n = positional.activeTeams;
  const needs = mine.needs.slice(0, LOOK_FOR_MAX);
  const surpluses = mine.surpluses.slice(0, LOOK_FOR_MAX);
  const withheld = (['QB', 'RB', 'WR', 'TE'] as const).filter((p) => mine.positions[p].label === 'withheld');
  const lines: string[] = [];

  if (needs.length) lines.push(`Top needs: ${needs.map((p) => `${p} (#${mine.positions[p].rank} of ${n} in market value)`).join(', ')}.`);
  if (surpluses.length) {
    lines.push(
      `Top surpluses: ${surpluses
        .map((p) => `${p} (${mine.positions[p].surplus.map((x) => `${x.name} ${fmt(x.value!)}`).join(', ')})`)
        .join('; ')}.`,
    );
  }
  if (withheld.length) lines.push(`Not enough data at ${withheld.join(', ')} (a key player has no FantasyCalc value).`);
  if (!needs.length && !surpluses.length) {
    lines.push(withheld.length ? 'No other position stands out by market value.' : 'No position stands out: your market value ranks in the middle or better everywhere, with no surplus.');
  }

  const needText = needs.join(', ');
  const surplusText = surpluses.join(', ');
  const tie = (s: 'buy' | 'hold' | 'sell') => {
    if (s === 'buy') return needs.length ? `Buying: look to add market value at ${needText}${surpluses.length ? `; your surplus at ${surplusText} is what you could offer` : ''}.` : surpluses.length ? `Buying: no clear need; your surplus at ${surplusText} is what you could offer.` : null;
    if (s === 'hold') return needs.length && surpluses.length ? `Holding: if you do trade, your surplus at ${surplusText} could address ${needText}.` : null;
    return surpluses.length ? `Selling: your surplus at ${surplusText} is the clearest market value to move.` : needs.length ? `Selling: no surplus stands out; value is thin at ${needText}.` : null;
  };
  if (stance.kind === 'recommendation') {
    const t = tie(stance.stance);
    if (t) lines.push(t);
  } else if (stance.kind === 'insufficient') {
    const t = tie(stance.leaning);
    lines.push(`Your stance isn't confident yet (leaning ${stance.leaning}).${t ? ` If you act on it: ${t[0]!.toLowerCase()}${t.slice(1)}` : ''}`);
  } else {
    lines.push('No stance right now, so these are market-value notes only.');
  }
  return { available: true, lines };
}
