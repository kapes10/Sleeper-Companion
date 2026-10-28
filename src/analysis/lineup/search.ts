// Stage 6: player search over the cached Sleeper player list. Pure; no ranking by value.
import type { Player, PlayerIndex } from '../../domain/players';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const SEARCH_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
export const SEARCH_LIMIT = 25;

/**
 * Players whose name contains every word typed (ignoring case, accents and punctuation).
 * Players on the owner's rosters come first, then alphabetical; same-name players stay separate
 * (the screen shows team, position and injury status to tell them apart).
 */
export function searchPlayers(players: PlayerIndex, query: string, rostered: ReadonlySet<string>, limit = SEARCH_LIMIT): Player[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length || words.join('').length < 2) return [];
  const hits = Object.values(players).filter((p) => {
    if (!rostered.has(p.id) && !(p.position && SEARCH_POSITIONS.includes(p.position))) return false;
    const n = norm(p.name);
    return words.every((w) => n.includes(w));
  });
  return hits
    .sort((a, b) => Number(rostered.has(b.id)) - Number(rostered.has(a.id)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Every player ID on any of the owner's rosters (for "on your rosters" labels). */
export function rosteredIds(rosterPlayerLists: (string[] | null | undefined)[]): Set<string> {
  return new Set(rosterPlayerLists.flatMap((l) => l ?? []));
}
