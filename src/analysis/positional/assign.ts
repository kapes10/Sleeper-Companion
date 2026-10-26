// Optimal slot assignment for the hypothetical market-value lineup. This is an assignment
// problem (each player fills at most one slot, each slot at most one player), solved exactly with
// the Hungarian method. A greedy top-down fill is NOT optimal once FLEX/SUPER_FLEX overlap.

/**
 * Maximum-weight assignment of rows (slots) to columns (players).
 * `weights[r][c]` is the gain of putting player c in slot r, or null if not allowed.
 * Every slot may also stay empty (gain 0). Returns, for each slot, the player index or -1.
 */
export function maxWeightAssignment(weights: (number | null)[][]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const players = weights[0]!.length;
  // Add one "empty" column per slot so every slot can always be filled (with nothing).
  const m = players + n;
  const FORBIDDEN = 1e15;
  const cost = (r: number, c: number) => {
    if (c >= players) return 0;
    const w = weights[r]![c];
    return w === null || w === undefined ? FORBIDDEN : -w;
  };
  // Standard O(n²m) Hungarian algorithm with potentials (1-indexed internally).
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else minv[j] = minv[j]! - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }
  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    const row = p[j]!;
    if (row && j - 1 < players && weights[row - 1]![j - 1] !== null) result[row - 1] = j - 1;
  }
  return result;
}

/** Gain used for an unvalued player: tiny, so they only fill a slot no valued player can. */
export const UNVALUED_GAIN = 1e-6;

export interface Candidate {
  id: string;
  /** FantasyCalc value, or null if unvalued. */
  value: number | null;
  /** Slots this player may fill. */
  canFill: (slot: string) => boolean;
}

/** Builds the lineup that maximises total matched value. Returns the candidate (or null) per slot. */
export function bestLineup<C extends Candidate>(slots: string[], candidates: C[]): (C | null)[] {
  const weights = slots.map((slot) => candidates.map((c) => (c.canFill(slot) ? (c.value === null ? UNVALUED_GAIN : c.value + UNVALUED_GAIN * 2) : null)));
  const lineup = maxWeightAssignment(weights).map((i) => (i >= 0 ? candidates[i]! : null));
  return tidy(slots, lineup);
}

/**
 * Display tidy-up that never changes the total: when two players could swap slots, put the more
 * valuable one in the earlier slot (Sleeper lists dedicated slots before FLEX/SUPER_FLEX), so e.g.
 * the best WR shows in a WR slot rather than FLEX.
 */
function tidy<C extends Candidate>(slots: string[], lineup: (C | null)[]): (C | null)[] {
  const out = [...lineup];
  const rank = (c: C | null) => (c === null ? -2 : c.value === null ? -1 : c.value);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i] ?? null;
        const b = out[j] ?? null;
        if (rank(b) > rank(a) && b !== null && b.canFill(slots[i]!) && (a === null || a.canFill(slots[j]!))) {
          out[i] = b;
          out[j] = a;
          changed = true;
        }
      }
    }
  }
  return out;
}
