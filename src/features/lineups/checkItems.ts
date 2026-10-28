// Runs "Check again" for saved items: one forced read of only those items' leagues, then the
// approved verification rules. A failed read records the failure and never changes workflow.
import { checkable, checkItem, expireMissingLeague, recordFailure, type LineupItem } from '../../analysis/lineup/verify';
import type { Services } from '../../services';
import { leagueTypeOf, loadLeagueTypes } from '../../storage/lineup';
import type { SavedAccount } from '../../storage/prefs';
import { freshRead } from './loadLineups';

/** Returns every item, with the checked ones updated. Only checkable items' leagues are requested. */
export async function checkItems(services: Services, account: SavedAccount, all: LineupItem[], keys: ReadonlySet<string>): Promise<LineupItem[]> {
  const targets = all.filter((i) => keys.has(i.key) && checkable(i));
  if (!targets.length) return all;
  const leagueIds = [...new Set(targets.map((i) => i.leagueId))];
  const playersP = services.players().then(
    (p) => ({ ok: true as const, players: p.players }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const [read, players] = await Promise.all([freshRead(services, account, leagueIds), playersP]);
  const types = loadLeagueTypes();
  const at = services.now();
  const check = (item: LineupItem): LineupItem => {
    if (!read.ok) return recordFailure(item, read.error, at);
    if (!players.ok) return recordFailure(item, players.error, at);
    const r = read.rosters.get(item.leagueId)!;
    if (!r.ok) return recordFailure(item, r.error, at);
    const league = read.leagues.find((l) => l.league_id === item.leagueId);
    if (!league) return expireMissingLeague(item, r.receivedAt);
    const fresh = { state: read.state, league, rosters: r.rosters, ownerId: account.userId, players: players.players, receivedAt: r.receivedAt };
    return checkItem(item, fresh, leagueTypeOf(types, item.leagueId));
  };
  const updated = new Map(targets.map((i) => [i.key, check(i)]));
  return all.map((i) => updated.get(i.key) ?? i);
}
