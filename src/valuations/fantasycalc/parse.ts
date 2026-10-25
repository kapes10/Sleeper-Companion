// Validates and reads a raw FantasyCalc /values/current response. The raw text is stored
// untouched by the job; this only decides whether it's usable and extracts what the app needs.

export interface FcPlayerValue {
  fcId: number | null;
  /** null when FantasyCalc gave no Sleeper ID — reported as unmatched, never matched by name. */
  sleeperId: string | null;
  name: string;
  position: string;
  team: string | null;
  value: number;
  overallRank: number | null;
  positionRank: number | null;
}

/** Draft picks are stored but not displayed or used yet. */
export interface FcPickValue {
  name: string;
  pickId: string | null;
  value: number;
}

export interface FcUnreadableRow {
  index: number;
  reason: string;
}

export type FcParseResult =
  | { ok: true; players: FcPlayerValue[]; picks: FcPickValue[]; unreadable: FcUnreadableRow[] }
  | { ok: false; error: string };

export interface FcParseOptions {
  /** Reject a response with fewer readable player rows than this (guards against truncated data). */
  minPlayers?: number;
  /** Reject if more than this share of rows is unreadable. */
  maxUnreadableShare?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseFcResponse(raw: unknown, { minPlayers = 50, maxUnreadableShare = 0.1 }: FcParseOptions = {}): FcParseResult {
  if (!Array.isArray(raw)) return { ok: false, error: 'Response is not a list of values.' };
  if (raw.length === 0) return { ok: false, error: 'Response was empty (no values).' };

  const players: FcPlayerValue[] = [];
  const picks: FcPickValue[] = [];
  const unreadable: FcUnreadableRow[] = [];

  raw.forEach((row, index) => {
    if (!isObj(row) || !isObj(row.player)) return unreadable.push({ index, reason: 'missing player details' });
    const p = row.player;
    const value = num(row.value);
    if (value === null) return unreadable.push({ index, reason: 'value missing or not a number' });
    if (value < 0) return unreadable.push({ index, reason: 'negative value' });
    const position = str(p.position);
    const name = str(p.name);
    if (!position || !name) return unreadable.push({ index, reason: 'missing name or position' });
    if (position === 'PICK') return picks.push({ name, pickId: str(p.sleeperId), value });
    players.push({
      fcId: num(p.id),
      sleeperId: str(p.sleeperId),
      name,
      position,
      team: str(p.maybeTeam),
      value,
      overallRank: num(row.overallRank),
      positionRank: num(row.positionRank),
    });
  });

  if (players.length < minPlayers) {
    return { ok: false, error: `Only ${players.length} readable player values (expected at least ${minPlayers}).` };
  }
  if (unreadable.length / raw.length > maxUnreadableShare) {
    return { ok: false, error: `${unreadable.length} of ${raw.length} rows were unreadable.` };
  }
  return { ok: true, players, picks, unreadable };
}
