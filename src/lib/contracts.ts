import { z } from "zod";

/*
 * Shared contracts between the weekly pipeline (src/lib/pipeline) and the UI (src/app).
 *
 * A brief is stored in Supabase `briefs` as four JSON columns: stats, analysis, quality, delivery.
 * The pipeline validates against these schemas before writing; the UI validates again when reading,
 * so a malformed row is shown as an error instead of crashing a page.
 *
 * Rule of thumb: every NUMBER in a brief is computed by code (stats, change); the AI only writes
 * words and groups thread keys, and every thread key it cites is checked against real collected data.
 */

export const SOURCE_SLUGS = ["hackernews", "stackoverflow", "devto"] as const;
export const SourceSlugSchema = z.enum(SOURCE_SLUGS);
export type SourceSlug = z.infer<typeof SourceSlugSchema>;

export const SOURCE_NAMES: Record<SourceSlug, string> = {
  hackernews: "Hacker News",
  stackoverflow: "Stack Overflow",
  devto: "DEV Community",
};

/* ----------------------------- Week-over-week change ----------------------------- */

export const TREND_LABELS = ["new", "rising", "steady", "falling", "quiet"] as const;
export const TrendSchema = z.enum(TREND_LABELS);
export type Trend = z.infer<typeof TrendSchema>;

/** Always computed by code from two counts (see pipeline/trend.ts), never by the AI. */
export const ChangeSchema = z.object({
  current: z.number().int().nonnegative(),
  previous: z.number().int().nonnegative(),
  abs: z.number().int(),
  /** Percentage change; null when previous is 0 (avoids "infinite %"). */
  pct: z.number().nullable(),
  trend: TrendSchema,
});
export type Change = z.infer<typeof ChangeSchema>;

/* ----------------------------- Topic configuration (Supabase) ----------------------------- */

export type TopicKeyword = { keyword: string; requiresContext: boolean };

export type TopicCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  keywords: TopicKeyword[];
};

export type SourceConfig = {
  slug: SourceSlug;
  name: string;
  isActive: boolean;
  /** Stack Overflow / DEV tags to pull recent posts from (Hacker News is searched per keyword). */
  tags: string[];
  /** Hacker News only: also search comments, not just story titles/text. */
  includeComments: boolean;
};

export type PulseConfig = {
  categories: TopicCategory[];
  contextTerms: string[];
  sources: SourceConfig[];
  /** Hash of the active categories + keywords; cached AI classifications are reused only while it matches. */
  configHash: string;
};

/* ----------------------------- Weeks (Asia/Kolkata) ----------------------------- */

export const WeekSchema = z.object({
  /** YYYY-MM-DD of the Friday this week ends on (window end is that Friday 00:00 IST, exclusive). */
  weekEnd: z.string(),
  /** ISO instant, inclusive. */
  start: z.string(),
  /** ISO instant, exclusive. */
  end: z.string(),
  /** Human label, e.g. "2 – 8 Oct". */
  label: z.string(),
});
export type Week = z.infer<typeof WeekSchema>;

/* ----------------------------- Threads (evidence) ----------------------------- */

export const EngagementSchema = z.object({
  points: z.number().optional(),
  comments: z.number().optional(),
  answers: z.number().optional(),
  views: z.number().optional(),
  reactions: z.number().optional(),
  isAnswered: z.boolean().optional(),
  hasAcceptedAnswer: z.boolean().optional(),
});
export type Engagement = z.infer<typeof EngagementSchema>;

/** A discussion thread as shown in the UI: an HN story, a Stack Overflow question or a DEV article. */
export const ThreadRefSchema = z.object({
  /** "<source>:<id>", e.g. "hackernews:41234567". The unit the AI cites. */
  threadKey: z.string(),
  source: SourceSlugSchema,
  title: z.string(),
  url: z.string(),
  /** ISO instant of the first matching mention in the week. */
  postedAt: z.string(),
  /** Matching posts (story/comment/question/article) in this thread during the week. */
  mentions: z.number().int().nonnegative(),
  engagement: EngagementSchema,
  categories: z.array(z.string()),
  keywords: z.array(z.string()),
  /** Short plain-text excerpt of the most relevant matching post. */
  excerpt: z.string(),
});
export type ThreadRef = z.infer<typeof ThreadRefSchema>;

/* ----------------------------- Stats (deterministic, code-computed) ----------------------------- */

const FourCounts = z.array(z.number().int().nonnegative()).length(4);

export const CategoryStatSchema = z.object({
  slug: z.string(),
  name: z.string(),
  /** Matching posts per week, oldest → newest (index 3 = this brief's week). */
  mentions: FourCounts,
  /** Distinct threads with ≥1 matching post per week. */
  threads: FourCounts,
  /** Threads this week vs last week. */
  change: ChangeSchema,
  /** AI relevance check of this week's matched threads (null if the AI step was unavailable). */
  verified: z
    .object({
      checked: z.number().int().nonnegative(),
      relevant: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type CategoryStat = z.infer<typeof CategoryStatSchema>;

export const KeywordStatSchema = z.object({
  keyword: z.string(),
  category: z.string(),
  /** Matching posts per week, oldest → newest. */
  mentions: FourCounts,
  change: ChangeSchema,
});
export type KeywordStat = z.infer<typeof KeywordStatSchema>;

export const SourceStatSchema = z.object({
  source: SourceSlugSchema,
  name: z.string(),
  mentions: FourCounts,
  threads: FourCounts,
});
export type SourceStat = z.infer<typeof SourceStatSchema>;

export const StatsSchema = z.object({
  timezone: z.literal("Asia/Kolkata"),
  /** Exactly 4 weeks, oldest → newest; weeks[3] is the brief's own week. */
  weeks: z.array(WeekSchema).length(4),
  totals: z.object({ mentions: FourCounts, threads: FourCounts }),
  sources: z.array(SourceStatSchema),
  /** Sorted by this week's thread count, descending. */
  categories: z.array(CategoryStatSchema),
  /** Every keyword with ≥1 mention in the 4 weeks, sorted by this week's mentions, descending. */
  keywords: z.array(KeywordStatSchema),
  /** This week's most-engaged matching threads (deterministic ranking, no AI). */
  topThreads: z.array(ThreadRefSchema),
  /** This week's Stack Overflow questions still without an accepted answer. */
  unanswered: z.array(ThreadRefSchema),
});
export type Stats = z.infer<typeof StatsSchema>;

/* ----------------------------- Analysis (AI-written, code-validated) ----------------------------- */

export const PainPointSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** A category slug from the topic config. */
  category: z.string(),
  summary: z.string(),
  /** Thread keys from this week that discuss this pain point (validated to exist). */
  thisWeek: z.array(z.string()),
  /** Thread keys from last week that discuss the same pain point (validated to exist). */
  lastWeek: z.array(z.string()),
  /** Computed from thisWeek.length vs lastWeek.length. */
  change: ChangeSchema,
  /** True when the threads show the problem has no accepted answer / no good tool / only workarounds. */
  unresolved: z.boolean(),
  quote: z.object({ threadKey: z.string(), text: z.string() }).nullable(),
});
export type PainPoint = z.infer<typeof PainPointSchema>;

export const UnderservedSchema = z.object({
  problem: z.string(),
  whyUnderserved: z.string(),
  toolsMentioned: z.array(z.string()),
  opportunity: z.string(),
  threadKeys: z.array(z.string()),
});
export type Underserved = z.infer<typeof UnderservedSchema>;

export const ObjectionSchema = z.object({
  objection: z.string(),
  context: z.string(),
  threadKeys: z.array(z.string()),
});
export type Objection = z.infer<typeof ObjectionSchema>;

export const SprintSuggestionSchema = z.object({
  suggestion: z.string(),
  rationale: z.string(),
  painPointIds: z.array(z.string()),
});
export type SprintSuggestion = z.infer<typeof SprintSuggestionSchema>;

export const AnalysisSchema = z.object({
  headline: z.string(),
  /** Sorted by thisWeek count, descending. */
  painPoints: z.array(PainPointSchema),
  underserved: z.array(UnderservedSchema),
  objections: z.array(ObjectionSchema),
  sprintSuggestions: z.array(SprintSuggestionSchema),
  watchlist: z.array(z.object({ signal: z.string(), threadKeys: z.array(z.string()) })),
  caveats: z.array(z.string()),
  /** Every thread key cited anywhere above → display info. */
  evidence: z.record(z.string(), ThreadRefSchema),
  /** "ai" = written by Gemini and validated; "fallback" = deterministic summary because the AI step failed. */
  mode: z.enum(["ai", "fallback"]),
  model: z.string().nullable(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

/* ----------------------------- Quality checks (shown in the UI) ----------------------------- */

export const SourceRunSchema = z.object({
  source: SourceSlugSchema,
  name: z.string(),
  ok: z.boolean(),
  items: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
  ms: z.number().nonnegative(),
  error: z.string().nullable(),
  notes: z.array(z.string()),
});
export type SourceRun = z.infer<typeof SourceRunSchema>;

export const QualitySchema = z.object({
  runId: z.string().nullable(),
  durationMs: z.number().nonnegative(),
  sources: z.array(SourceRunSchema),
  matching: z.object({
    fetched: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
    /** Posts that matched a generic keyword but had no domain context term, so were not counted. */
    droppedNoContext: z.number().int().nonnegative(),
    threads: z.number().int().nonnegative(),
  }),
  classification: z.object({
    candidates: z.number().int().nonnegative(),
    checked: z.number().int().nonnegative(),
    fromCache: z.number().int().nonnegative(),
    relevant: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    models: z.array(z.string()),
  }),
  synthesis: z.object({
    ok: z.boolean(),
    mode: z.enum(["ai", "fallback"]),
    model: z.string().nullable(),
    attempts: z.number().int().nonnegative(),
    ms: z.number().nonnegative(),
    error: z.string().nullable(),
  }),
  citations: z.object({
    cited: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
  }),
  /** Anything the pipeline capped (e.g. threads sent to the AI) — never silently truncated. */
  caps: z.array(z.object({ what: z.string(), kept: z.number().int(), dropped: z.number().int() })),
  /** Human-readable checklist rendered on the brief page. */
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string() })),
});
export type Quality = z.infer<typeof QualitySchema>;

/* ----------------------------- Delivery ----------------------------- */

export const DeliverySchema = z.object({
  channel: z.enum(["email", "web"]),
  status: z.enum(["sent", "skipped", "failed"]),
  to: z.array(z.string()),
  at: z.string().nullable(),
  detail: z.string().nullable(),
});
export type Delivery = z.infer<typeof DeliverySchema>;

/* ----------------------------- Stored rows ----------------------------- */

export const BRIEF_STATUSES = ["complete", "partial", "failed"] as const;
export const TRIGGERS = ["cron", "manual", "backfill"] as const;

export const BriefRecordSchema = z.object({
  id: z.string(),
  weekEnd: z.string(),
  weekStart: z.string(),
  status: z.enum(BRIEF_STATUSES),
  trigger: z.enum(TRIGGERS),
  generatedAt: z.string(),
  stats: StatsSchema,
  analysis: AnalysisSchema.nullable(),
  quality: QualitySchema,
  delivery: DeliverySchema,
});
export type BriefRecord = z.infer<typeof BriefRecordSchema>;

export const RUN_STEP_STATUSES = ["running", "ok", "warning", "failed", "skipped"] as const;

export const RunStepSchema = z.object({
  name: z.string(),
  status: z.enum(RUN_STEP_STATUSES),
  ms: z.number().nonnegative().nullable(),
  detail: z.string(),
});
export type RunStep = z.infer<typeof RunStepSchema>;

export const RunRecordSchema = z.object({
  id: z.string(),
  trigger: z.enum(TRIGGERS),
  weekEnd: z.string(),
  status: z.enum(["running", "complete", "partial", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  steps: z.array(RunStepSchema),
  error: z.string().nullable(),
  briefId: z.string().nullable(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;
