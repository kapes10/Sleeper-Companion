// Approved 0–100 scale (TRADE_LOGIC.md, 2026-10-25):
//   scaled = value ÷ highest player value in the same set × 100, rounded to a whole number.
// A matched value that rounds below 1 is displayed as "<1" so it is never confused with "no value".

export function topValue(values: number[]): number | null {
  let top = 0;
  for (const v of values) if (Number.isFinite(v) && v > top) top = v;
  return top > 0 ? top : null;
}

export function scaleValue(value: number, top: number): number {
  return Math.round((value / top) * 100);
}

export function formatScaled(scaled: number): string {
  return scaled < 1 ? '<1' : String(scaled);
}
