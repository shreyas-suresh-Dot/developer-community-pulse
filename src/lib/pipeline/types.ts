import type { Engagement, SourceSlug } from "../contracts";

/*
 * Internal pipeline types (not stored as-is). Public/stored shapes live in ../contracts.ts.
 *
 * Module map (each file owns one step; all are server-only except the pure ones):
 *   config.ts      loadConfig(): Promise<PulseConfig>                                  Supabase read
 *   sources/*.ts   fetchHackerNews | fetchStackOverflow | fetchDevTo → SourceResult     HTTP, never throw
 *   sources/index  collectAll(config, weeks, ctx): Promise<SourceResult[]>              parallel, never throws
 *   matching.ts    buildMatcher(config) → Matcher                                       pure
 *   stats.ts       buildStats({config, weeks, mentions, sourceResults}) → {stats, threads} pure
 *   ai.ts          generateJson({schema, system, prompt, …}) → {data, model, attempts, ms}  Gemini w/ fallback
 *   classify.ts    classifyThreads({config, candidates, cached, deadline})              Gemini, cached by caller
 *   synthesize.ts  synthesizeBrief({config, stats, weeks, threads, insights, deadline}) Gemini + validation, never throws
 *   store.ts       Supabase RPC wrappers (mentions, insights, brief, runs, delivery)
 *   deliver.ts     deliverBrief(brief) → Delivery                                       Resend, optional
 *   run.ts         runPipeline({trigger, weekEnd?, runId?}) → RunOutcome                 orchestrator
 */

/** One post from a community, normalised by a source adapter. */
export type RawMention = {
  source: SourceSlug;
  /** Unique within the source: HN objectID, SO question_id, DEV article id. */
  externalId: string;
  kind: "story" | "comment" | "question" | "article";
  /** `${source}:${threadId}`. For an HN comment this is its story, e.g. "hackernews:41234567". */
  threadKey: string;
  threadTitle: string;
  /** Permalink to this post. */
  url: string;
  /** Permalink to the whole thread. */
  threadUrl: string;
  /** Plain text that keywords are matched against (title + body / the comment itself). */
  text: string;
  /** Extra plain text that counts for context terms only (e.g. the HN story title of a comment). */
  contextText: string;
  /** Plain-text excerpt, ≤ 500 chars, for display and for the AI. */
  excerpt: string;
  author: string | null;
  /** ISO instant. */
  postedAt: string;
  engagement: Engagement;
};

export type MatchedMention = RawMention & {
  /** Keyword strings exactly as configured in Supabase. */
  matchedKeywords: string[];
  /** Category slugs of the matched keywords. */
  matchedCategories: string[];
  /** 0–3 index into the 4-week window. */
  weekIndex: number;
};

export type MatchResult = {
  keywords: string[];
  categories: string[];
  /** True when only context-requiring keywords matched and no context term was present. */
  droppedNoContext: boolean;
};

export type Matcher = { match(mention: RawMention): MatchResult };

export type SourceResult = {
  source: SourceSlug;
  name: string;
  ok: boolean;
  items: RawMention[];
  requests: number;
  ms: number;
  error: string | null;
  notes: string[];
};

export type FetchContext = {
  /** Epoch ms after which no new requests should start. */
  deadline: number;
  signal?: AbortSignal;
};

/** A discussion thread aggregated across the 4-week window (built by stats.ts). */
export type ThreadAgg = {
  threadKey: string;
  source: SourceSlug;
  title: string;
  url: string;
  /** Matching posts per week, oldest → newest. */
  mentionsByWeek: [number, number, number, number];
  categories: string[];
  keywords: string[];
  /** Best engagement seen across the thread's mentions (story points, comment count, answers…). */
  engagement: Engagement;
  /** ISO instant of the earliest matching mention. */
  firstPostedAt: string;
  /** Excerpt of the matching post with the most keyword hits. */
  excerpt: string;
};

export const UNRESOLVED_SIGNALS = ["none", "asks_for_help", "no_good_tool", "workaround", "complaint"] as const;
export type UnresolvedSignal = (typeof UNRESOLVED_SIGNALS)[number];

/** AI reading of one thread; cached in Supabase `thread_insights` keyed by threadKey + configHash. */
export type ThreadInsight = {
  /** On-topic for a code-review / CI / developer-workflow product (not just a keyword coincidence). */
  relevant: boolean;
  /** A category slug from the config, or "other". */
  category: string;
  /** Expresses a problem, frustration or unmet need (vs news, tutorial, announcement). */
  isPain: boolean;
  /** The concrete problem in ≤ 15 words; "" when isPain is false. */
  painPoint: string;
  unresolved: UnresolvedSignal;
  /** Tool / product names the thread mentions (≤ 5). */
  tools: string[];
};
