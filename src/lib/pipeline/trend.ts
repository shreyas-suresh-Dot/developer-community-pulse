import type { Change, Trend } from "../contracts";

/*
 * Week-over-week change. Deterministic and deliberately conservative:
 * small numbers are "quiet" rather than a dramatic percentage.
 */

export const MIN_VOLUME = 3;
export const MIN_PCT = 25;

export function change(current: number, previous: number): Change {
  const abs = current - previous;
  const pct = previous === 0 ? null : Math.round((abs / previous) * 100);
  return { current, previous, abs, pct, trend: trendLabel(current, previous, abs, pct) };
}

function trendLabel(current: number, previous: number, abs: number, pct: number | null): Trend {
  if (current < MIN_VOLUME && previous < MIN_VOLUME) return "quiet";
  if (previous === 0 || pct === null) return "new";
  if (pct >= MIN_PCT && abs >= MIN_VOLUME) return "rising";
  if (pct <= -MIN_PCT && abs <= -MIN_VOLUME) return "falling";
  return "steady";
}
