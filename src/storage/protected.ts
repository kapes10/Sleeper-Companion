// Protected players (players the owner won't trade), saved per league in THIS browser's
// localStorage. Device-only: it does not sync to other devices and is never sent anywhere.

const key = (leagueId: string) => `sleeper-companion:protected:${leagueId}`;

export function loadProtected(leagueId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(leagueId));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveProtected(leagueId: string, ids: ReadonlySet<string>): void {
  try {
    if (ids.size) localStorage.setItem(key(leagueId), JSON.stringify([...ids].sort()));
    else localStorage.removeItem(key(leagueId));
  } catch {
    // Storage blocked or full: the choice still applies for this visit.
  }
}
