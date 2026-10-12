import {
  SOURCE_NAMES,
  SOURCE_SLUGS,
  type CategoryStat,
  type Engagement,
  type KeywordStat,
  type PulseConfig,
  type SourceSlug,
  type SourceStat,
  type Stats,
  type ThreadRef,
  type Week,
} from "../contracts";
import { change } from "./trend";
import type { MatchedMention, SourceResult, ThreadAgg } from "./types";

/*
 * Count step: every number in a brief is computed here, from the run's own matched mentions (never
 * from database rows), so it is reproducible. Pure and deterministic: every displayed order has an
 * explicit tie-break. Mentions = matching posts; threads = distinct discussions with ≥1 matching post
 * in a week (an HN story and its comments are one thread).
 */

export const TOP_THREADS = 12;
export const UNANSWERED_LIMIT = 10;

type Four = [number, number, number, number];
const zeros = (): Four => [0, 0, 0, 0];
const fourSets = (): [Set<string>, Set<string>, Set<string>, Set<string>] => [new Set(), new Set(), new Set(), new Set()];
const sizes = (sets: Set<string>[]): Four => [sets[0].size, sets[1].size, sets[2].size, sets[3].size];
const sum = (counts: readonly number[]) => counts.reduce((a, b) => a + b, 0);
const num = (value: number | undefined) => value ?? 0;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type BuildStatsInput = {
  config: PulseConfig;
  /** Exactly 4 weeks, oldest first (fourWeeks()). */
  weeks: Week[];
  mentions: MatchedMention[];
  sourceResults: SourceResult[];
};

/** What one thread looked like inside one week; lets threadRef describe that week, not the whole month. */
type WeekView = { postedAt: string; excerpt: string; keywords: string[]; categories: string[] };
const weekViews = new WeakMap<ThreadAgg, Array<WeekView | null>>();

const NUMERIC_ENGAGEMENT = ["points", "comments", "answers", "views", "reactions"] as const;

/** Best value per engagement field across a thread's posts. */
export function mergeEngagement(a: Engagement, b: Engagement): Engagement {
  const merged: Engagement = { ...a };
  for (const field of NUMERIC_ENGAGEMENT) {
    const value = b[field];
    const current = merged[field];
    if (typeof value === "number" && (current === undefined || value > current)) merged[field] = value;
  }
  if (b.isAnswered !== undefined) merged.isAnswered = Boolean(merged.isAnswered) || b.isAnswered;
  if (b.hasAcceptedAnswer !== undefined) merged.hasAcceptedAnswer = Boolean(merged.hasAcceptedAnswer) || b.hasAcceptedAnswer;
  return merged;
}

/** Excerpt choice: most keyword hits, then the thread's own post over a comment, then earliest. */
function betterExcerptSource(candidate: MatchedMention, current: MatchedMention): boolean {
  const byHits = candidate.matchedKeywords.length - current.matchedKeywords.length;
  if (byHits !== 0) return byHits > 0;
  const rootCandidate = candidate.kind !== "comment";
  const rootCurrent = current.kind !== "comment";
  if (rootCandidate !== rootCurrent) return rootCandidate;
  const byTime = Date.parse(candidate.postedAt) - Date.parse(current.postedAt);
  if (byTime !== 0) return byTime < 0;
  return compareText(candidate.externalId, current.externalId) < 0;
}

/** Ranking used for topThreads: more matching posts that week, then comments, points, reactions. */
export function threadRanking(weekIdx: number): (a: ThreadAgg, b: ThreadAgg) => number {
  return (a, b) =>
    b.mentionsByWeek[weekIdx] - a.mentionsByWeek[weekIdx] ||
    num(b.engagement.comments) - num(a.engagement.comments) ||
    num(b.engagement.points) - num(a.engagement.points) ||
    num(b.engagement.reactions) - num(a.engagement.reactions) ||
    compareText(a.threadKey, b.threadKey);
}

/** Display form of a thread for one week (0 = oldest, 3 = the brief's week), as cited in a brief. */
export function threadRef(thread: ThreadAgg, weekIdx: number): ThreadRef {
  if (!Number.isInteger(weekIdx) || weekIdx < 0 || weekIdx >= thread.mentionsByWeek.length) {
    throw new RangeError(`threadRef: week index ${weekIdx} is outside 0–3`);
  }
  const view = weekViews.get(thread)?.[weekIdx] ?? null;
  return {
    threadKey: thread.threadKey,
    source: thread.source,
    title: thread.title,
    url: thread.url,
    postedAt: view?.postedAt ?? thread.firstPostedAt,
    mentions: thread.mentionsByWeek[weekIdx],
    engagement: { ...thread.engagement },
    categories: [...(view?.categories ?? thread.categories)],
    keywords: [...(view?.keywords ?? thread.keywords)],
    excerpt: view?.excerpt ?? thread.excerpt,
  };
}

type WeekBuilder = { first: string; best: MatchedMention; keywords: Set<string>; categories: Set<string> };
type ThreadBuilder = {
  agg: Omit<ThreadAgg, "categories" | "keywords" | "excerpt">;
  best: MatchedMention;
  keywords: Set<string>;
  categories: Set<string>;
  weeks: Array<WeekBuilder | null>;
};
type Bucket = { mentions: Four; threads: [Set<string>, Set<string>, Set<string>, Set<string>] };
const bucket = (): Bucket => ({ mentions: zeros(), threads: fourSets() });

export function buildStats(input: BuildStatsInput): { stats: Stats; threads: Map<string, ThreadAgg> } {
  const { config, weeks, mentions, sourceResults } = input;
  if (weeks.length !== 4) throw new Error(`buildStats needs exactly 4 weeks, got ${weeks.length}`);

  const categoryOrder = new Map(config.categories.map((c, i) => [c.slug, i]));
  const keywordOrder = new Map<string, number>();
  const keywordCategories = new Map<string, string[]>();
  for (const category of config.categories) {
    for (const { keyword } of category.keywords) {
      if (!keywordOrder.has(keyword)) keywordOrder.set(keyword, keywordOrder.size);
      keywordCategories.set(keyword, [...(keywordCategories.get(keyword) ?? []), category.slug]);
    }
  }
  const byCategoryOrder = (a: string, b: string) => (categoryOrder.get(a) ?? Infinity) - (categoryOrder.get(b) ?? Infinity) || compareText(a, b);
  const byKeywordOrder = (a: string, b: string) => (keywordOrder.get(a) ?? Infinity) - (keywordOrder.get(b) ?? Infinity) || compareText(a, b);

  const totals = bucket();
  const bySource = new Map<SourceSlug, Bucket>();
  const byCategory = new Map(config.categories.map((c) => [c.slug, bucket()]));
  const byKeyword = new Map<string, Four>();
  const builders = new Map<string, ThreadBuilder>();

  for (const m of mentions) {
    const w = m.weekIndex;
    if (!Number.isInteger(w) || w < 0 || w > 3) continue;

    totals.mentions[w]++;
    totals.threads[w].add(m.threadKey);
    const source = bySource.get(m.source) ?? bucket();
    bySource.set(m.source, source);
    source.mentions[w]++;
    source.threads[w].add(m.threadKey);

    for (const slug of m.matchedCategories) {
      const category = byCategory.get(slug);
      if (!category) continue;
      category.mentions[w]++;
      category.threads[w].add(m.threadKey);
    }
    for (const keyword of m.matchedKeywords) {
      for (const slug of keywordCategories.get(keyword) ?? []) {
        if (!m.matchedCategories.includes(slug)) continue;
        const key = `${slug}\u0000${keyword}`;
        const counts = byKeyword.get(key) ?? zeros();
        counts[w]++;
        byKeyword.set(key, counts);
      }
    }

    let thread = builders.get(m.threadKey);
    if (!thread) {
      thread = {
        agg: {
          threadKey: m.threadKey,
          source: m.source,
          title: m.threadTitle,
          url: m.threadUrl,
          mentionsByWeek: zeros(),
          engagement: {},
          firstPostedAt: m.postedAt,
        },
        best: m,
        keywords: new Set(),
        categories: new Set(),
        weeks: [null, null, null, null],
      };
      builders.set(m.threadKey, thread);
    }
    const { agg } = thread;
    agg.mentionsByWeek[w]++;
    agg.engagement = mergeEngagement(agg.engagement, m.engagement);
    if (Date.parse(m.postedAt) < Date.parse(agg.firstPostedAt)) agg.firstPostedAt = m.postedAt;
    if (agg.title.startsWith("(untitled") && !m.threadTitle.startsWith("(untitled")) agg.title = m.threadTitle;
    if (betterExcerptSource(m, thread.best)) thread.best = m;
    m.matchedKeywords.forEach((k) => thread.keywords.add(k));
    m.matchedCategories.forEach((c) => thread.categories.add(c));

    const week = thread.weeks[w] ?? { first: m.postedAt, best: m, keywords: new Set<string>(), categories: new Set<string>() };
    thread.weeks[w] = week;
    if (Date.parse(m.postedAt) < Date.parse(week.first)) week.first = m.postedAt;
    if (betterExcerptSource(m, week.best)) week.best = m;
    m.matchedKeywords.forEach((k) => week.keywords.add(k));
    m.matchedCategories.forEach((c) => week.categories.add(c));
  }

  const threads = new Map<string, ThreadAgg>();
  for (const [key, builder] of builders) {
    const thread: ThreadAgg = {
      ...builder.agg,
      categories: [...builder.categories].sort(byCategoryOrder),
      keywords: [...builder.keywords].sort(byKeywordOrder),
      excerpt: builder.best.excerpt,
    };
    weekViews.set(
      thread,
      builder.weeks.map((week) =>
        week
          ? {
              postedAt: week.first,
              excerpt: week.best.excerpt,
              keywords: [...week.keywords].sort(byKeywordOrder),
              categories: [...week.categories].sort(byCategoryOrder),
            }
          : null,
      ),
    );
    threads.set(key, thread);
  }

  const sourceSlugs = SOURCE_SLUGS.filter(
    (slug) => config.sources.some((s) => s.slug === slug) || sourceResults.some((r) => r.source === slug) || bySource.has(slug),
  );
  const sources: SourceStat[] = sourceSlugs.map((slug) => {
    const counts = bySource.get(slug) ?? bucket();
    const name = config.sources.find((s) => s.slug === slug)?.name ?? sourceResults.find((r) => r.source === slug)?.name ?? SOURCE_NAMES[slug];
    return { source: slug, name, mentions: [...counts.mentions], threads: sizes(counts.threads) };
  });

  const categories: CategoryStat[] = config.categories
    .map((category) => {
      const counts = byCategory.get(category.slug) ?? bucket();
      const threadCounts = sizes(counts.threads);
      return {
        slug: category.slug,
        name: category.name,
        mentions: [...counts.mentions],
        threads: threadCounts,
        change: change(threadCounts[3], threadCounts[2]),
        verified: null,
      };
    })
    .sort((a, b) => b.threads[3] - a.threads[3] || b.mentions[3] - a.mentions[3] || byCategoryOrder(a.slug, b.slug));

  const keywords: KeywordStat[] = [];
  for (const category of config.categories) {
    for (const { keyword } of category.keywords) {
      const counts = byKeyword.get(`${category.slug}\u0000${keyword}`);
      if (!counts || sum(counts) === 0) continue;
      keywords.push({ keyword, category: category.slug, mentions: [...counts], change: change(counts[3], counts[2]) });
    }
  }
  keywords.sort(
    (a, b) =>
      b.mentions[3] - a.mentions[3] ||
      b.mentions[2] - a.mentions[2] ||
      sum(b.mentions) - sum(a.mentions) ||
      byKeywordOrder(a.keyword, b.keyword) ||
      byCategoryOrder(a.category, b.category),
  );

  const thisWeek = [...threads.values()].filter((t) => t.mentionsByWeek[3] > 0);
  const topThreads = [...thisWeek].sort(threadRanking(3)).slice(0, TOP_THREADS).map((t) => threadRef(t, 3));
  const unanswered = thisWeek
    .filter((t) => t.source === "stackoverflow" && !t.engagement.hasAcceptedAnswer)
    .sort(
      (a, b) =>
        num(b.engagement.views) - num(a.engagement.views) ||
        num(a.engagement.answers) - num(b.engagement.answers) ||
        compareText(a.threadKey, b.threadKey),
    )
    .slice(0, UNANSWERED_LIMIT)
    .map((t) => threadRef(t, 3));

  const stats: Stats = {
    timezone: "Asia/Kolkata",
    weeks: weeks.map((w) => ({ ...w })),
    totals: { mentions: [...totals.mentions], threads: sizes(totals.threads) },
    sources,
    categories,
    keywords,
    topThreads,
    unanswered,
  };
  return { stats, threads };
}
