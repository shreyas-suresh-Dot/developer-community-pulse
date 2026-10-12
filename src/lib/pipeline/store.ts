import "server-only";
import { z } from "zod";
import {
  AnalysisSchema,
  BRIEF_STATUSES,
  DeliverySchema,
  QualitySchema,
  RunStepSchema,
  StatsSchema,
  TRIGGERS,
  type Analysis,
  type Delivery,
  type Quality,
  type RunRecord,
  type RunStep,
  type Stats,
} from "../contracts";
import { pipelineRpc, supabase } from "../supabase";
import { addDays, isFriday } from "../weeks";
import { UNRESOLVED_SIGNALS, type MatchedMention, type ThreadInsight } from "./types";

/*
 * Store step: thin wrappers around Supabase. Reads use the publishable key (RLS makes it read-only);
 * every write goes through a token-checked pipeline_* function via pipelineRpc. Payloads are validated
 * against the shared contracts before they are written, so a malformed brief fails loudly here
 * instead of breaking a page later. Batches are chunked to keep each request small.
 */

export type BriefStatus = (typeof BRIEF_STATUSES)[number];
export type Trigger = (typeof TRIGGERS)[number];
export type RunStatus = RunRecord["status"];

export const MENTION_CHUNK = 400;
export const INSIGHT_READ_CHUNK = 150;
const INSIGHT_WRITE_CHUNK = 400;

export const ThreadInsightSchema = z.object({
  relevant: z.boolean(),
  category: z.string(),
  isPain: z.boolean(),
  painPoint: z.string(),
  unresolved: z.enum(UNRESOLVED_SIGNALS),
  tools: z.array(z.string()),
}) satisfies z.ZodType<ThreadInsight>;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function validated<T extends z.ZodType>(schema: T, value: unknown, what: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${what} failed validation: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

function readError(table: string, error: { message: string }): Error {
  return new Error(`Could not read ${table} from Supabase: ${error.message}`);
}

/* ----------------------------- Mentions ----------------------------- */

/** Upserts matched posts (idempotent on source + external_id). Returns rows written. */
export async function saveMentions(mentions: readonly MatchedMention[]): Promise<number> {
  // One upsert statement cannot touch the same row twice, so duplicates are collapsed first.
  const unique = new Map<string, MatchedMention>();
  for (const m of mentions) unique.set(`${m.source}:${m.externalId}`, m);
  const rows = [...unique.values()].map((m) => ({
    source: m.source,
    external_id: m.externalId,
    kind: m.kind,
    thread_key: m.threadKey,
    thread_title: m.threadTitle,
    url: m.url,
    excerpt: m.excerpt,
    author: m.author,
    posted_at: m.postedAt,
    engagement: m.engagement,
    matched_keywords: m.matchedKeywords,
    matched_categories: m.matchedCategories,
  }));
  let saved = 0;
  for (const chunk of chunks(rows, MENTION_CHUNK)) {
    saved += Number(await pipelineRpc<number>("pipeline_upsert_mentions", { p_rows: chunk })) || 0;
  }
  return saved;
}

/* ----------------------------- AI classification cache ----------------------------- */

/** Cached insights for these threads that were produced under the same configHash; invalid rows are skipped. */
export async function loadInsights(threadKeys: readonly string[], configHash: string): Promise<Map<string, ThreadInsight>> {
  const insights = new Map<string, ThreadInsight>();
  const RowSchema = z.object({ thread_key: z.string(), insight: z.unknown() });
  for (const chunk of chunks([...new Set(threadKeys)], INSIGHT_READ_CHUNK)) {
    const { data, error } = await supabase()
      .from("thread_insights")
      .select("thread_key, insight")
      .eq("config_hash", configHash)
      .in("thread_key", chunk);
    if (error) throw readError("thread_insights", error);
    for (const raw of data ?? []) {
      const row = RowSchema.safeParse(raw);
      const insight = row.success ? ThreadInsightSchema.safeParse(row.data.insight) : null;
      if (row.success && insight?.success) insights.set(row.data.thread_key, insight.data);
    }
  }
  return insights;
}

/** Caches insights under configHash (one row per thread, replaced on re-classification). Invalid insights are skipped. */
export async function saveInsights(
  rows: ReadonlyArray<{ threadKey: string; insight: ThreadInsight; model: string }>,
  configHash: string,
): Promise<number> {
  const unique = new Map<string, { thread_key: string; config_hash: string; model: string; insight: ThreadInsight }>();
  for (const row of rows) {
    const insight = ThreadInsightSchema.safeParse(row.insight);
    if (!insight.success) continue;
    unique.set(row.threadKey, { thread_key: row.threadKey, config_hash: configHash, model: row.model, insight: insight.data });
  }
  let saved = 0;
  for (const chunk of chunks([...unique.values()], INSIGHT_WRITE_CHUNK)) {
    saved += Number(await pipelineRpc<number>("pipeline_upsert_insights", { p_rows: chunk })) || 0;
  }
  return saved;
}

/* ----------------------------- Runs ----------------------------- */

export async function startRun(trigger: Trigger, weekEnd: string): Promise<string> {
  if (!isFriday(weekEnd)) throw new Error(`startRun: weekEnd ${weekEnd} is not a Friday`);
  const id = await pipelineRpc<unknown>("pipeline_start_run", { p_trigger: trigger, p_week_end: weekEnd });
  return validated(z.string().min(1), id, "pipeline_start_run result");
}

export type RunUpdate = {
  status: RunStatus;
  /** Omit to keep the stored steps. */
  steps?: RunStep[];
  error?: string | null;
  briefId?: string | null;
};

export async function updateRun(runId: string, update: RunUpdate): Promise<void> {
  const steps = update.steps === undefined ? null : validated(z.array(RunStepSchema), update.steps, "Run steps");
  await pipelineRpc("pipeline_update_run", {
    p_run_id: runId,
    p_status: update.status,
    p_steps: steps,
    p_error: update.error ?? null,
    p_brief_id: update.briefId ?? null,
  });
}

const RunRowSchema = z.object({ id: z.string(), started_at: z.string() });

/** A run for this week that is still marked running and started less than maxAgeMinutes ago. */
export async function findActiveRun(weekEnd: string, maxAgeMinutes = 10): Promise<{ id: string; startedAt: string } | null> {
  const since = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();
  const { data, error } = await supabase()
    .from("pipeline_runs")
    .select("id, started_at")
    .eq("week_end", weekEnd)
    .eq("status", "running")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw readError("pipeline_runs", error);
  const row = z.array(RunRowSchema).parse(data ?? [])[0];
  return row ? { id: row.id, startedAt: row.started_at } : null;
}

/** Start time of the most recent run (optionally of one trigger), for the manual-run cooldown. */
export async function lastRunStartedAt(trigger?: Trigger): Promise<Date | null> {
  let query = supabase().from("pipeline_runs").select("id, started_at");
  if (trigger) query = query.eq("trigger", trigger);
  const { data, error } = await query.order("started_at", { ascending: false }).limit(1);
  if (error) throw readError("pipeline_runs", error);
  const row = z.array(RunRowSchema).parse(data ?? [])[0];
  return row ? new Date(row.started_at) : null;
}

/**
 * Runs still "running" after olderThanMinutes died with their function (timeout, crash). Marks them
 * failed, closing any step left "running", so the UI stops showing a spinner. Returns how many.
 */
export async function markStaleRunsFailed(olderThanMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data, error } = await supabase()
    .from("pipeline_runs")
    .select("id, steps")
    .eq("status", "running")
    .lt("started_at", cutoff);
  if (error) throw readError("pipeline_runs", error);
  const rows = z.array(z.object({ id: z.string(), steps: z.unknown() })).parse(data ?? []);
  for (const row of rows) {
    const steps = z.array(RunStepSchema).safeParse(row.steps);
    const closed = steps.success
      ? steps.data.map((s) => (s.status === "running" ? { ...s, status: "failed" as const, detail: s.detail ? `${s.detail} (interrupted)` : "Interrupted" } : s))
      : null;
    await pipelineRpc("pipeline_update_run", {
      p_run_id: row.id,
      p_status: "failed",
      p_steps: closed,
      p_error: `Run did not finish within ${olderThanMinutes} minutes (timed out or crashed); marked failed by a later run.`,
      p_brief_id: null,
    });
  }
  return rows.length;
}

/* ----------------------------- Briefs ----------------------------- */

export type SaveBriefInput = {
  /** Friday (YYYY-MM-DD) the brief's week ends on; the stored week_start is 7 days earlier. */
  weekEnd: string;
  status: BriefStatus;
  trigger: Trigger;
  stats: Stats;
  analysis: Analysis | null;
  quality: Quality;
  delivery: Delivery;
  runId: string | null;
};

/** Validates every JSON column against the contracts, then upserts the brief by week_end. Returns its id. */
export async function saveBrief(input: SaveBriefInput): Promise<string> {
  if (!isFriday(input.weekEnd)) throw new Error(`saveBrief: weekEnd ${input.weekEnd} is not a Friday`);
  const stats = validated(StatsSchema, input.stats, "Brief stats");
  if (stats.weeks[3].weekEnd !== input.weekEnd) {
    throw new Error(`saveBrief: stats are for week ending ${stats.weeks[3].weekEnd}, not ${input.weekEnd}`);
  }
  const brief = {
    week_end: input.weekEnd,
    week_start: addDays(input.weekEnd, -7),
    status: validated(z.enum(BRIEF_STATUSES), input.status, "Brief status"),
    trigger: validated(z.enum(TRIGGERS), input.trigger, "Brief trigger"),
    stats,
    analysis: input.analysis === null ? null : validated(AnalysisSchema, input.analysis, "Brief analysis"),
    quality: validated(QualitySchema, input.quality, "Brief quality"),
    delivery: validated(DeliverySchema, input.delivery, "Brief delivery"),
    run_id: input.runId,
  };
  const id = await pipelineRpc<unknown>("pipeline_save_brief", { p_brief: brief });
  return validated(z.string().min(1), id, "pipeline_save_brief result");
}

export async function setDelivery(briefId: string, delivery: Delivery): Promise<void> {
  await pipelineRpc("pipeline_set_delivery", {
    p_brief_id: briefId,
    p_delivery: validated(DeliverySchema, delivery, "Delivery"),
  });
}
