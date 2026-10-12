import type { CategoryStat, KeywordStat, PulseConfig, SourceStat, Stats, ThreadRef, Week } from "../../contracts";
import { SOURCE_NAMES, SOURCE_SLUGS } from "../../contracts";
import { change } from "../trend";
import type { ThreadAgg } from "../types";
import { rankForWeek, toThreadRef } from "../validate";

/*
 * Minimal Stats derived from a thread fixture, so AI-layer tests do not depend on stats.ts.
 * A thread's mentions count for each of its keywords and categories (good enough for fixtures).
 */

const WEEKS = [0, 1, 2, 3] as const;

export function buildFixtureStats(
  config: PulseConfig,
  weeks: Week[],
  threads: readonly ThreadAgg[],
  unansweredKeys: readonly string[] = [],
): Stats {
  const mentions = (match: (t: ThreadAgg) => boolean) =>
    WEEKS.map((w) => threads.filter(match).reduce((n, t) => n + t.mentionsByWeek[w], 0));
  const threadCounts = (match: (t: ThreadAgg) => boolean) =>
    WEEKS.map((w) => threads.filter((t) => match(t) && t.mentionsByWeek[w] > 0).length);

  const categories: CategoryStat[] = config.categories
    .map((c) => {
      const match = (t: ThreadAgg) => t.categories.includes(c.slug);
      const counts = threadCounts(match);
      return {
        slug: c.slug,
        name: c.name,
        mentions: mentions(match),
        threads: counts,
        change: change(counts[3], counts[2]),
        verified: null,
      };
    })
    .sort((a, b) => b.threads[3] - a.threads[3]);

  const categoryOf = new Map(config.categories.flatMap((c) => c.keywords.map((k) => [k.keyword, c.slug] as const)));
  const keywords: KeywordStat[] = [...new Set(threads.flatMap((t) => t.keywords))]
    .map((keyword) => {
      const counts = mentions((t) => t.keywords.includes(keyword));
      return {
        keyword,
        category: categoryOf.get(keyword) ?? "code-review-general",
        mentions: counts,
        change: change(counts[3], counts[2]),
      };
    })
    .filter((k) => k.mentions.some((n) => n > 0))
    .sort((a, b) => b.mentions[3] - a.mentions[3]);

  const sources: SourceStat[] = SOURCE_SLUGS.map((source) => ({
    source,
    name: SOURCE_NAMES[source],
    mentions: mentions((t) => t.source === source),
    threads: threadCounts((t) => t.source === source),
  }));

  const byKey = new Map(threads.map((t) => [t.threadKey, t]));
  const unanswered: ThreadRef[] = unansweredKeys.flatMap((key) => {
    const thread = byKey.get(key);
    return thread ? [toThreadRef(thread, 3)] : [];
  });

  return {
    timezone: "Asia/Kolkata",
    weeks,
    totals: { mentions: mentions(() => true), threads: threadCounts(() => true) },
    sources,
    categories,
    keywords,
    topThreads: rankForWeek(
      threads.filter((t) => t.mentionsByWeek[3] > 0),
      3,
    )
      .slice(0, 10)
      .map((t) => toThreadRef(t, 3)),
    unanswered,
  };
}
