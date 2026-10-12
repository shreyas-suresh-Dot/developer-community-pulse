import type {
  Analysis,
  Objection,
  PainPoint,
  PulseConfig,
  Quality,
  SprintSuggestion,
  ThreadRef,
  Underserved,
  Week,
} from "../contracts";
import { change } from "./trend";
import type { ThreadAgg } from "./types";

/*
 * The deterministic gate between Gemini and the brief (DESIGN §4). The model only groups thread keys
 * and writes words; this module keeps the keys it was really shown, in the right week, counts them,
 * checks that quotes are verbatim and drops every claim left without evidence. It also holds the
 * small pure thread helpers the AI steps share. No I/O.
 */

/** Positions of the brief's own week and the comparison week in every 4-week array. */
export const THIS_WEEK = 3;
export const LAST_WEEK = 2;

export const LIMITS = {
  headline: 240,
  title: 80,
  summary: 360,
  quote: 220,
  text: 300,
  caveat: 240,
  id: 16,
  tool: 40,
  tools: 5,
  painPoints: 8,
  underserved: 4,
  objections: 4,
  sprintSuggestions: 3,
  watchlist: 4,
  caveats: 4,
} as const;

/** Shortest quote (after normalisation) worth verifying; a shorter one proves nothing. */
const MIN_QUOTE_CHARS = 12;

const QUIET_HEADLINE = "Quiet week: no clear themes stood out in this week's discussions.";

/** The model's reply as parsed by the synthesis schema, before any checks. */
export type RawPainPoint = {
  id: string;
  title: string;
  category: string;
  summary: string;
  thisWeek: string[];
  lastWeek: string[];
  unresolved: boolean;
  quote: { key: string; text: string } | null;
};

export type RawAnalysis = {
  headline: string;
  painPoints: RawPainPoint[];
  underserved: {
    problem: string;
    whyUnderserved: string;
    toolsMentioned: string[];
    opportunity: string;
    threadKeys: string[];
  }[];
  objections: { objection: string; context: string; threadKeys: string[] }[];
  sprintSuggestions: { suggestion: string; rationale: string; painPointIds: string[] }[];
  watchlist: { signal: string; threadKeys: string[] }[];
  caveats: string[];
};

export type ValidationContext = {
  config: PulseConfig;
  weeks: Week[];
  threads: ReadonlyMap<string, ThreadAgg>;
  /** Keys shown to the model as active this week / last week. */
  allowedThisWeek: ReadonlySet<string>;
  allowedLastWeek: ReadonlySet<string>;
};

export type ValidatedAnalysis = {
  analysis: Omit<Analysis, "mode" | "model">;
  citations: Quality["citations"];
};

/* ----------------------------- Thread helpers ----------------------------- */

/** ThreadAgg → display ThreadRef for one week (same semantics as stats.ts `threadRef`). */
export function toThreadRef(thread: ThreadAgg, weekIdx: number): ThreadRef {
  return {
    threadKey: thread.threadKey,
    source: thread.source,
    title: thread.title,
    url: thread.url,
    postedAt: thread.firstPostedAt,
    mentions: thread.mentionsByWeek[weekIdx] ?? 0,
    engagement: thread.engagement,
    categories: thread.categories,
    keywords: thread.keywords,
    excerpt: thread.excerpt,
  };
}

/** Most active first: that week's mentions, then comments, then points; key as a stable tie-break. */
export function rankForWeek(threads: readonly ThreadAgg[], weekIdx: number): ThreadAgg[] {
  return [...threads].sort(
    (a, b) =>
      b.mentionsByWeek[weekIdx] - a.mentionsByWeek[weekIdx] ||
      (b.engagement.comments ?? 0) - (a.engagement.comments ?? 0) ||
      (b.engagement.points ?? 0) - (a.engagement.points ?? 0) ||
      (a.threadKey < b.threadKey ? -1 : a.threadKey > b.threadKey ? 1 : 0),
  );
}

/**
 * Threads active this week and threads active only last week, each ranked, then interleaved (this week
 * leads each pair); older ones are left out. Interleaving means any cap keeps an equally ranked sample
 * of both weeks, so per-pain-point week-over-week counts compare like with like.
 */
export function prioritizeThreads(threads: Iterable<ThreadAgg>): ThreadAgg[] {
  const all = [...threads];
  const thisWeek = rankForWeek(all.filter((t) => t.mentionsByWeek[THIS_WEEK] > 0), THIS_WEEK);
  const lastOnly = rankForWeek(all.filter((t) => t.mentionsByWeek[THIS_WEEK] === 0 && t.mentionsByWeek[LAST_WEEK] > 0), LAST_WEEK);
  const ordered: ThreadAgg[] = [];
  for (let i = 0; i < Math.max(thisWeek.length, lastOnly.length); i++) {
    if (i < thisWeek.length) ordered.push(thisWeek[i]);
    if (i < lastOnly.length) ordered.push(lastOnly[i]);
  }
  return ordered;
}

/* ----------------------------- Text helpers ----------------------------- */

/** Collapses whitespace and cuts to `max` characters, preferring a word boundary, with an ellipsis. */
export function clip(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Trimmed, clipped, case-insensitively unique, non-empty strings, at most `maxItems`. */
export function uniqueStrings(values: readonly string[], maxItems: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const s = clip(value, maxLength);
    const k = s.toLowerCase();
    if (!s || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Lowercase, no quotation marks, single spaces: the form quotes and excerpts are compared in. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'`“”‘’«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the quote (ignoring case, spacing, quotation marks and a trailing ellipsis) occurs in the excerpt. */
export function isVerbatimQuote(quote: string, excerpt: string): boolean {
  const q = normalizeForMatch(quote)
    .replace(/^(?:\.\.\.|…)\s*/, "")
    .replace(/\s*(?:\.\.\.|…)$/, "")
    .replace(/[.!?,;:]+$/, "")
    .trim();
  return q.length >= MIN_QUOTE_CHARS && normalizeForMatch(excerpt).includes(q);
}

function stripWrappingQuotes(text: string): string {
  return text.trim().replace(/^["'“‘]+|["'”’]+$/g, "");
}

/* ----------------------------- Validation ----------------------------- */

/** Keeps the keys `accept` approves, trimmed and without repeats, in the given order. */
function keepKeys(keys: readonly string[], accept: (key: string) => boolean): string[] {
  const kept: string[] = [];
  for (const raw of keys) {
    const key = raw.trim();
    if (key && !kept.includes(key) && accept(key)) kept.push(key);
  }
  return kept;
}

export function validateAnalysis(raw: RawAnalysis, ctx: ValidationContext): ValidatedAnalysis {
  const inThis = (key: string) => ctx.allowedThisWeek.has(key) && ctx.threads.has(key);
  const inLast = (key: string) => ctx.allowedLastWeek.has(key) && ctx.threads.has(key);
  const inEither = (key: string) => inThis(key) || inLast(key);

  const painPoints = validatePainPoints(raw.painPoints, ctx, inThis, inLast);
  const ids = new Set(painPoints.map((p) => p.id));

  const underserved: Underserved[] = raw.underserved
    .flatMap((u) => {
      const threadKeys = keepKeys(u.threadKeys, inEither);
      const problem = clip(u.problem, LIMITS.text);
      if (threadKeys.length === 0 || !problem) return [];
      return [
        {
          problem,
          whyUnderserved: clip(u.whyUnderserved, LIMITS.text),
          toolsMentioned: uniqueStrings(u.toolsMentioned, LIMITS.tools, LIMITS.tool),
          opportunity: clip(u.opportunity, LIMITS.text),
          threadKeys,
        },
      ];
    })
    .slice(0, LIMITS.underserved);

  const objections: Objection[] = raw.objections
    .flatMap((o) => {
      const threadKeys = keepKeys(o.threadKeys, inEither);
      const objection = clip(o.objection, LIMITS.text);
      if (threadKeys.length === 0 || !objection) return [];
      return [{ objection, context: clip(o.context, LIMITS.text), threadKeys }];
    })
    .slice(0, LIMITS.objections);

  const sprintSuggestions: SprintSuggestion[] = raw.sprintSuggestions
    .flatMap((s) => {
      const painPointIds = keepKeys(s.painPointIds, (id) => ids.has(id));
      const suggestion = clip(s.suggestion, LIMITS.text);
      if (painPointIds.length === 0 || !suggestion) return [];
      return [{ suggestion, rationale: clip(s.rationale, LIMITS.text), painPointIds }];
    })
    .slice(0, LIMITS.sprintSuggestions);

  const watchlist = raw.watchlist
    .flatMap((w) => {
      const threadKeys = keepKeys(w.threadKeys, inEither);
      const signal = clip(w.signal, LIMITS.text);
      if (threadKeys.length === 0 || !signal) return [];
      return [{ signal, threadKeys }];
    })
    .slice(0, LIMITS.watchlist);

  const caveats = raw.caveats
    .map((c) => clip(c, LIMITS.caveat))
    .filter(Boolean)
    .slice(0, LIMITS.caveats);

  const evidence: Record<string, ThreadRef> = {};
  const cite = (key: string) => {
    const thread = ctx.threads.get(key);
    if (thread && !evidence[key]) {
      evidence[key] = toThreadRef(thread, ctx.allowedThisWeek.has(key) ? THIS_WEEK : LAST_WEEK);
    }
  };
  for (const p of painPoints) [...p.thisWeek, ...p.lastWeek].forEach(cite);
  for (const entry of [...underserved, ...objections, ...watchlist]) entry.threadKeys.forEach(cite);

  const cited = countCitations(raw.painPoints, [...raw.underserved, ...raw.objections, ...raw.watchlist]);
  const valid = countCitations(painPoints, [...underserved, ...objections, ...watchlist]);

  return {
    analysis: {
      headline: clip(raw.headline, LIMITS.headline) || QUIET_HEADLINE,
      painPoints,
      underserved,
      objections,
      sprintSuggestions,
      watchlist,
      caveats,
      evidence,
    },
    citations: { cited, valid, dropped: cited - valid },
  };
}

function validatePainPoints(
  raw: readonly RawPainPoint[],
  ctx: ValidationContext,
  inThis: (key: string) => boolean,
  inLast: (key: string) => boolean,
): PainPoint[] {
  const categories = new Map(ctx.config.categories.map((c) => [c.slug, c.name]));
  const defaultSlug = categories.has("code-review-general")
    ? "code-review-general"
    : (ctx.config.categories[0]?.slug ?? "other");
  // A thread counts towards at most one pain point per week: the first one (in the model's order) that cites it.
  const usedThis = new Set<string>();
  const usedLast = new Set<string>();
  const usedIds = new Set<string>();
  const kept: PainPoint[] = [];

  for (const p of raw) {
    const thisWeek = keepKeys(p.thisWeek, (k) => inThis(k) && !usedThis.has(k));
    const lastWeek = keepKeys(p.lastWeek, (k) => inLast(k) && !usedLast.has(k));
    if (thisWeek.length + lastWeek.length === 0) continue;
    thisWeek.forEach((k) => usedThis.add(k));
    lastWeek.forEach((k) => usedLast.add(k));

    const slug = p.category.trim();
    const category = categories.has(slug) ? slug : defaultSlug;
    const id = uniqueId(clip(p.id, LIMITS.id), usedIds);
    usedIds.add(id);
    kept.push({
      id,
      title: clip(p.title, LIMITS.title) || (categories.get(category) ?? category),
      category,
      summary: clip(p.summary, LIMITS.summary),
      thisWeek,
      lastWeek,
      change: change(thisWeek.length, lastWeek.length),
      unresolved: p.unresolved,
      quote: verifiedQuote(p.quote, [...thisWeek, ...lastWeek], ctx.threads),
    });
  }

  return kept
    .sort((a, b) => b.thisWeek.length - a.thisWeek.length || b.change.abs - a.change.abs)
    .slice(0, LIMITS.painPoints);
}

/** The given id when free; otherwise the first unused "P<n>". */
function uniqueId(id: string, used: ReadonlySet<string>): string {
  if (id && !used.has(id)) return id;
  let n = used.size + 1;
  while (used.has(`P${n}`)) n += 1;
  return `P${n}`;
}

/** Keeps a quote only when it cites one of the pain point's own threads and appears verbatim in its excerpt. */
function verifiedQuote(
  quote: RawPainPoint["quote"],
  keys: readonly string[],
  threads: ReadonlyMap<string, ThreadAgg>,
): PainPoint["quote"] {
  if (!quote) return null;
  const key = quote.key.trim();
  const thread = keys.includes(key) ? threads.get(key) : undefined;
  if (!thread || !isVerbatimQuote(quote.text, thread.excerpt)) return null;
  return { threadKey: key, text: clip(stripWrappingQuotes(quote.text), LIMITS.quote) };
}

type KeyedPainPoint = { thisWeek: readonly string[]; lastWeek: readonly string[]; quote: unknown };

function countCitations(painPoints: readonly KeyedPainPoint[], others: readonly { threadKeys: readonly string[] }[]): number {
  const inPainPoints = painPoints.reduce(
    (n, p) => n + p.thisWeek.length + p.lastWeek.length + (p.quote ? 1 : 0),
    0,
  );
  return inPainPoints + others.reduce((n, o) => n + o.threadKeys.length, 0);
}
