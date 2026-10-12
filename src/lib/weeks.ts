import type { Week } from "./contracts";

/*
 * Week windows in Asia/Kolkata (UTC+05:30, no daylight saving).
 * A brief is identified by the Friday its week ends on; that week covers
 * [Friday-7d 00:00 IST, Friday 00:00 IST). Pure functions, no I/O.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** YYYY-MM-DD of an instant, as a calendar date in IST. */
export function toIstDate(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant of 00:00 IST on a YYYY-MM-DD date. Throws on malformed or impossible dates. */
export function istMidnight(date: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date "${date}" (expected YYYY-MM-DD)`);
  const instant = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS);
  if (toIstDate(instant) !== date) throw new Error(`Invalid date "${date}"`);
  return instant;
}

export function addDays(date: string, days: number): string {
  return toIstDate(new Date(istMidnight(date).getTime() + days * DAY_MS));
}

export function isFriday(date: string): boolean {
  return new Date(istMidnight(date).getTime() + IST_OFFSET_MS).getUTCDay() === 5;
}

/** The most recent Friday whose 00:00 IST has already passed at `now`: the week a run reports on. */
export function latestWeekEnd(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const daysSinceFriday = (ist.getUTCDay() - 5 + 7) % 7;
  return new Date(ist.getTime() - daysSinceFriday * DAY_MS).toISOString().slice(0, 10);
}

function formatRange(first: string, last: string): string {
  const [, fm, fd] = first.split("-").map(Number);
  const [, lm, ld] = last.split("-").map(Number);
  return fm === lm
    ? `${fd} – ${ld} ${MONTHS[lm - 1]}`
    : `${fd} ${MONTHS[fm - 1]} – ${ld} ${MONTHS[lm - 1]}`;
}

/** Four consecutive weeks ending on the Friday `weekEnd`, oldest first (index 3 is the brief's own week). */
export function fourWeeks(weekEnd: string): Week[] {
  if (!isFriday(weekEnd)) throw new Error(`weekEnd ${weekEnd} is not a Friday`);
  return [3, 2, 1, 0].map((weeksBack) => {
    const end = addDays(weekEnd, -7 * weeksBack);
    const start = addDays(end, -7);
    return {
      weekEnd: end,
      start: istMidnight(start).toISOString(),
      end: istMidnight(end).toISOString(),
      label: formatRange(start, addDays(end, -1)),
    };
  });
}

/** Index (0–3) of the week containing `instant`, or -1 when it falls outside the 4-week window. */
export function weekIndexOf(weeks: Week[], instant: Date): number {
  const t = instant.getTime();
  return weeks.findIndex((w) => t >= Date.parse(w.start) && t < Date.parse(w.end));
}

/** "Fri 9 Oct 2026" — used in headings and email subjects. */
export function formatFriday(weekEnd: string): string {
  const [y, m, d] = weekEnd.split("-").map(Number);
  return `Fri ${d} ${MONTHS[m - 1]} ${y}`;
}
