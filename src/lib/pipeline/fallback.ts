import type { Analysis, PainPoint, PulseConfig, Stats, ThreadRef, Trend, Underserved, Week } from "../contracts";
import { change } from "./trend";
import type { ThreadAgg } from "./types";
import { clip, LAST_WEEK, LIMITS, rankForWeek, THIS_WEEK, toThreadRef } from "./validate";

/*
 * The brief Sumit still gets when the AI summary cannot run, or a week is too quiet to summarise:
 * built only from deterministic signals so Friday never arrives empty (DESIGN §4.5). One pain point
 * per active category (keyword-based, not AI-clustered), open Stack Overflow questions as underserved
 * candidates and rising keywords as the watchlist. Numbers are fine here: they all come from code.
 */

export type FallbackReason = "ai_unavailable" | "quiet_week";

export type FallbackInput = {
  config: PulseConfig;
  stats: Stats;
  weeks: Week[];
  threads: ReadonlyMap<string, ThreadAgg>;
  /** Why there is no AI summary; shapes the headline and caveats. Defaults to "ai_unavailable". */
  reason?: FallbackReason;
};

const MAX_KEYS_PER_WEEK = 25;
const MAX_UNANSWERED = 4;
const MAX_WATCHLIST = 4;
const WATCHLIST_THREADS = 3;

const TREND_WORDS: Record<Trend, string> = {
  new: "new this week",
  rising: "rising",
  steady: "steady",
  falling: "falling",
  quiet: "low volume",
};

export function buildFallbackAnalysis(input: FallbackInput): Analysis {
  const { config, stats } = input;
  const reason = input.reason ?? "ai_unavailable";
  const threads = [...input.threads.values()];
  const evidence: Record<string, ThreadRef> = {};
  const cite = (thread: ThreadAgg): string => {
    if (!evidence[thread.threadKey]) {
      const week = thread.mentionsByWeek[THIS_WEEK] > 0 ? THIS_WEEK : LAST_WEEK;
      evidence[thread.threadKey] = toThreadRef(thread, week);
    }
    return thread.threadKey;
  };

  const painPoints: PainPoint[] = config.categories
    .flatMap((category) => {
      const inCategory = threads.filter((t) => t.categories.includes(category.slug));
      const thisWeek = rankForWeek(
        inCategory.filter((t) => t.mentionsByWeek[THIS_WEEK] > 0),
        THIS_WEEK,
      );
      if (thisWeek.length === 0) return [];
      const lastWeek = rankForWeek(
        inCategory.filter((t) => t.mentionsByWeek[LAST_WEEK] > 0),
        LAST_WEEK,
      );
      // Prefer the category's own stat so the number matches the category table on the same page.
      const stat = stats.categories.find((c) => c.slug === category.slug);
      return [
        {
          id: "",
          title: clip(category.name, LIMITS.title),
          category: category.slug,
          summary: categorySummary(category.slug, stats, thisWeek.length),
          thisWeek: thisWeek.slice(0, MAX_KEYS_PER_WEEK).map(cite),
          lastWeek: lastWeek.slice(0, MAX_KEYS_PER_WEEK).map(cite),
          change: stat?.change ?? change(thisWeek.length, lastWeek.length),
          unresolved: false,
          quote: null,
        },
      ];
    })
    .sort((a, b) => b.change.current - a.change.current || b.change.abs - a.change.abs)
    .map((p, i) => ({ ...p, id: `P${i + 1}` }));

  const underserved: Underserved[] = stats.unanswered.slice(0, MAX_UNANSWERED).map((question) => {
    if (!evidence[question.threadKey]) evidence[question.threadKey] = question;
    return {
      problem: clip(`Open question: ${question.title}`, LIMITS.text),
      whyUnderserved: question.engagement.answers
        ? "Answered on Stack Overflow, but no answer has been accepted yet."
        : "No answers yet on Stack Overflow.",
      toolsMentioned: [],
      opportunity:
        "Check whether the product, its docs or a short guide solves this; a good answer is low-cost visibility with exactly this audience.",
      threadKeys: [question.threadKey],
    };
  });

  const watchlist = stats.keywords
    .filter((k) => k.change.trend === "rising" || k.change.trend === "new")
    .sort((a, b) => b.change.abs - a.change.abs || b.change.current - a.change.current)
    .slice(0, MAX_WATCHLIST)
    .map((k) => {
      const keyword = k.keyword.toLowerCase();
      const related = rankForWeek(
        threads.filter(
          (t) => t.mentionsByWeek[THIS_WEEK] > 0 && t.keywords.some((x) => x.toLowerCase() === keyword),
        ),
        THIS_WEEK,
      ).slice(0, WATCHLIST_THREADS);
      return {
        signal: `"${k.keyword}" is ${TREND_WORDS[k.change.trend]}: ${k.change.current} mentions this week vs ${k.change.previous} last week.`,
        threadKeys: related.map(cite),
      };
    });

  return {
    headline: headline(reason, painPoints[0]),
    painPoints,
    underserved,
    objections: [],
    sprintSuggestions: [],
    watchlist,
    caveats: caveats(reason),
    evidence,
    mode: "fallback",
    model: null,
  };
}

function categorySummary(slug: string, stats: Stats, threadCount: number): string {
  const keywords = stats.keywords
    .filter((k) => k.category === slug && k.mentions[THIS_WEEK] > 0)
    .sort((a, b) => b.mentions[THIS_WEEK] - a.mentions[THIS_WEEK])
    .slice(0, 3)
    .map((k) => `"${k.keyword}"`);
  const parts = ["Keyword-matched threads in this category, not clustered by AI."];
  if (keywords.length > 0) parts.push(`Most mentioned this week: ${keywords.join(", ")}.`);
  if (threadCount > MAX_KEYS_PER_WEEK) parts.push(`Showing the ${MAX_KEYS_PER_WEEK} most active of ${threadCount} threads.`);
  return clip(parts.join(" "), LIMITS.summary);
}

function headline(reason: FallbackReason, lead: PainPoint | undefined): string {
  const prefix =
    reason === "quiet_week"
      ? "Quiet week: too few relevant threads for an AI summary, so these are keyword signals."
      : "AI summary unavailable this week, so these are keyword-based signals.";
  if (!lead) return `${prefix} No matching discussions were found this week.`;
  const n = lead.change.current;
  return clip(
    `${prefix} ${lead.title} leads with ${n} thread${n === 1 ? "" : "s"} (${TREND_WORDS[lead.change.trend]}).`,
    LIMITS.headline,
  );
}

function caveats(reason: FallbackReason): string[] {
  const why =
    reason === "quiet_week"
      ? "The AI relevance check found too few on-topic threads this week for a reliable summary."
      : "The AI summary could not be generated in this run.";
  return [
    `${why} Pain points below are keyword-matched topic categories, not AI-clustered problems.`,
    "Keyword matches can include off-topic threads; counts are distinct threads per week.",
    "No sales objections or sprint suggestions are generated without the AI summary.",
  ];
}
