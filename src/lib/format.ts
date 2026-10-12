import type { Change, Engagement, SourceSlug, Trend, Week } from "./contracts";
import { addDays, fourWeeks } from "./weeks";

/*
 * Display formatting shared by server and client components. Pure and deterministic: dates are
 * shifted to IST by hand (no DST) instead of Intl, so server-rendered HTML and hydrated client
 * output always match, and nothing here reads the current time. Only *type* imports from
 * contracts, so client components can use these helpers without shipping zod to the browser.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MINUS = "−";

type IstParts = { year: number; month: number; day: number; weekday: number; hours: number; minutes: number };

function istParts(iso: string): IstParts | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + IST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "Fri 9 Oct, 07:02 IST" */
export function formatIstDateTime(iso: string): string {
  const p = istParts(iso);
  if (!p) return iso;
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}, ${pad2(p.hours)}:${pad2(p.minutes)} IST`;
}

/** "Fri 9 Oct 2026" */
export function formatIstDate(iso: string): string {
  const p = istParts(iso);
  if (!p) return iso;
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month]} ${p.year}`;
}

/** "9 Oct" — compact date for dense lists. */
export function formatIstDayMonth(iso: string): string {
  const p = istParts(iso);
  if (!p) return iso;
  return `${p.day} ${MONTHS[p.month]}`;
}

/** "07:02 IST" */
export function formatIstTime(iso: string): string {
  const p = istParts(iso);
  if (!p) return iso;
  return `${pad2(p.hours)}:${pad2(p.minutes)} IST`;
}

/** "2 – 8 Oct 2026" for a stored week (uses the pipeline's own label). */
export function weekTitle(week: Week): string {
  return `${week.label} ${yearOf(addDaysSafe(week.weekEnd, -1))}`;
}

/** "2 – 8 Oct 2026" for a week identified only by its Friday. Falls back to the raw date. */
export function weekLabel(weekEnd: string): string {
  try {
    return weekTitle(fourWeeks(weekEnd)[3]);
  } catch {
    return weekEnd;
  }
}

function addDaysSafe(date: string, days: number): string {
  try {
    return addDays(date, days);
  } catch {
    return date;
  }
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}

/** True for a real calendar date written as YYYY-MM-DD that falls on a Friday (a brief's id). */
export function isWeekEnd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    fourWeeks(value);
    return true;
  } catch {
    return false;
  }
}

/** "850 ms", "12.4 s", "2 min 28 s" */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

/** Duration between two ISO instants, or null when either is missing or invalid. */
export function durationBetween(startIso: string, endIso: string | null): number | null {
  if (!endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return end - start;
}

/** 1,284 · 12.9K · 1.2M */
export function formatCount(n: number): string {
  const sign = n < 0 ? MINUS : "";
  const abs = Math.abs(n);
  if (abs < 10_000) return sign + String(Math.round(abs)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (abs < 1_000_000) return `${sign}${trimZero((abs / 1000).toFixed(1))}K`;
  return `${sign}${trimZero((abs / 1_000_000).toFixed(1))}M`;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** "+5", "−3", "0" with a true minus sign. */
export function signed(n: number): string {
  if (n > 0) return `+${formatCount(n)}`;
  if (n < 0) return formatCount(n);
  return "0";
}

/** "+125%", "−42%"; null (previous week was 0) has no percentage. */
export function signedPct(pct: number | null): string | null {
  if (pct === null) return null;
  return `${signed(pct)}%`;
}

/** Compact change for tables: "+13 (+42%)", "+4 (none before)", "−3 (−25%)", "no change". */
export function changeShort(c: Change): string {
  if (c.abs === 0) return "no change";
  if (c.previous === 0) return `${signed(c.abs)} (none before)`;
  const pct = signedPct(c.pct);
  return pct ? `${signed(c.abs)} (${pct})` : signed(c.abs);
}

/** "+4 vs last week (+133%)", "+5 (none last week)", "same as last week", "none either week". */
export function changeText(c: Change): string {
  if (c.abs === 0) return c.current === 0 ? "none either week" : "same as last week";
  if (c.previous === 0) return `${signed(c.abs)} (none last week)`;
  const pct = signedPct(c.pct);
  return pct ? `${signed(c.abs)} vs last week (${pct})` : `${signed(c.abs)} vs last week`;
}

export const TREND_COPY: Record<Trend, { label: string; rule: string }> = {
  rising: { label: "Rising", rule: "Up at least 25% and by 3 or more vs last week" },
  falling: { label: "Falling", rule: "Down at least 25% and by 3 or more vs last week" },
  steady: { label: "Steady", rule: "Moved less than 25% or by fewer than 3" },
  new: { label: "New", rule: "Nothing last week, 3 or more this week" },
  quiet: { label: "Quiet", rule: "Under 3 in both weeks: too little data to call a trend" },
};

/** "1 thread", "3 threads" */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : pluralForm}`;
}

/** Rounded percentage, or null when the denominator is 0. */
export function percent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((100 * part) / whole);
}

/** "212 points · 148 comments" — the engagement figures that matter for each community. */
export function engagementText(e: Engagement): string {
  const parts: string[] = [];
  if (e.points !== undefined) parts.push(plural(e.points, "point"));
  if (e.reactions !== undefined) parts.push(plural(e.reactions, "reaction"));
  if (e.answers !== undefined) parts.push(plural(e.answers, "answer"));
  if (e.comments !== undefined) parts.push(plural(e.comments, "comment"));
  if (e.views !== undefined) parts.push(plural(e.views, "view"));
  if (e.hasAcceptedAnswer) parts.push("accepted answer");
  return parts.join(" · ");
}

/** Mirrors SOURCE_NAMES in contracts.ts (a test keeps them equal) without importing zod. */
const SOURCE_LABELS: Record<SourceSlug, string> = {
  hackernews: "Hacker News",
  stackoverflow: "Stack Overflow",
  devto: "DEV Community",
};

export function sourceName(slug: SourceSlug): string {
  return SOURCE_LABELS[slug] ?? slug;
}

/** The Friday `latest` and the `count - 1` Fridays before it, newest first. */
export function recentWeekEnds(latest: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDaysSafe(latest, -7 * i));
}

/** "45 s" / "2 min" for a Retry-After value in seconds. */
export function waitText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "a moment";
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 min" : `${minutes} min`;
}

/** First block of a UUID, for compact display ("5f0c2a7e"). */
export function shortId(id: string): string {
  return id.split("-")[0] || id;
}

/** Only http(s) links from community data are rendered as links. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A stable, attribute-safe fragment id from free text (AI-written ids, slugs). */
export function anchorId(prefix: string, raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${prefix}-${slug || "item"}`;
}

/** "01", "02" … for ranked lists. */
export function rank(i: number): string {
  return pad2(i + 1);
}
