import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { z } from "zod";
import {
  BRIEF_STATUSES,
  BriefRecordSchema,
  RunRecordSchema,
  SourceSlugSchema,
  TRIGGERS,
  type BriefRecord,
  type RunRecord,
  type SourceSlug,
} from "./contracts";
import { supabase } from "./supabase";

/*
 * Read side of the web app. Pages get all their data here: server-only, publishable key, and RLS makes
 * every table read-only for it. JSON columns are validated again with the shared contracts, so a
 * malformed row becomes a DataError that the page renders as a friendly box instead of crashing.
 * Nothing is cached: pages render these reads at request time inside <Suspense>, so a brief appears
 * the moment the pipeline saves it. PULSE_FIXTURE=1 swaps in sample data for local UI work only.
 */

export type DataErrorKind = "not-configured" | "unreachable" | "invalid";

export class DataError extends Error {
  readonly kind: DataErrorKind;

  constructor(kind: DataErrorKind, message: string) {
    super(message);
    this.name = "DataError";
    this.kind = kind;
  }
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: DataError };

/** Turns a DataError into a value the page can render; anything else is a bug and keeps propagating. */
export async function settle<T>(promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof DataError) return { ok: false, error };
    throw error;
  }
}

/* ----------------------------- Public read API ----------------------------- */

export type BriefSummary = {
  id: string;
  weekEnd: string;
  weekStart: string;
  status: BriefRecord["status"];
  trigger: BriefRecord["trigger"];
  generatedAt: string;
  headline: string | null;
  mode: "ai" | "fallback" | null;
  topPainPoint: string | null;
  threadsThisWeek: number | null;
};

export type TopicKeywordView = { keyword: string; requiresContext: boolean; isActive: boolean };

export type TopicCategoryView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
  keywords: TopicKeywordView[];
};

export type SourceView = {
  slug: SourceSlug;
  name: string;
  isActive: boolean;
  tags: string[];
  includeComments: boolean;
  /** Set when the row's config JSON could not be read; the pipeline would ignore it too. */
  configIssue: string | null;
  updatedAt: string;
};

export type TopicConfigView = {
  categories: TopicCategoryView[];
  contextTerms: { term: string; isActive: boolean }[];
  sources: SourceView[];
  /** Most recent change to any config row. */
  lastUpdated: string | null;
};

export const getLatestBrief = cache(async (): Promise<BriefRecord | null> => {
  if (fixtureMode()) return (await fixtures()).sampleBrief;
  const row = await read("the latest brief", (db) =>
    db.from("briefs").select(BRIEF_COLUMNS).order("week_end", { ascending: false }).limit(1).maybeSingle(),
  );
  return row === null ? null : toBrief(row);
});

export const getBrief = cache(async (weekEnd: string): Promise<BriefRecord | null> => {
  if (fixtureMode()) {
    const { sampleBrief, sampleFallbackBrief } = await fixtures();
    return [sampleBrief, sampleFallbackBrief].find((b) => b.weekEnd === weekEnd) ?? null;
  }
  const row = await read(`the brief for week ending ${weekEnd}`, (db) =>
    db.from("briefs").select(BRIEF_COLUMNS).eq("week_end", weekEnd).maybeSingle(),
  );
  return row === null ? null : toBrief(row);
});

export async function listBriefs(limit = 52): Promise<BriefSummary[]> {
  if (fixtureMode()) return (await fixtures()).sampleBriefSummaries.slice(0, limit);
  const rows = await read("the brief archive", (db) =>
    db.from("briefs").select(SUMMARY_COLUMNS).order("week_end", { ascending: false }).limit(limit),
  );
  return parseRows("the brief archive", z.array(SummaryRowSchema), rows ?? []).map((r) => ({
    id: r.id,
    weekEnd: r.week_end,
    weekStart: r.week_start,
    status: r.status,
    trigger: r.trigger,
    generatedAt: r.generated_at,
    headline: r.headline,
    mode: r.mode,
    topPainPoint: r.top_pain_point,
    threadsThisWeek: r.threads,
  }));
}

export async function getTopicConfig(): Promise<TopicConfigView> {
  if (fixtureMode()) return (await fixtures()).sampleTopicConfig;
  const [categories, keywords, terms, sources] = await Promise.all([
    read("topic categories", (db) =>
      db.from("topic_categories").select("id, slug, name, description, is_active, sort_order, updated_at"),
    ),
    read("topic keywords", (db) =>
      db.from("topic_keywords").select("category_id, keyword, requires_context, is_active, updated_at"),
    ),
    read("context terms", (db) => db.from("context_terms").select("term, is_active, created_at")),
    read("community sources", (db) => db.from("community_sources").select("slug, name, is_active, config, updated_at")),
  ]);
  return toTopicConfig({
    categories: parseRows("topic categories", z.array(CategoryRowSchema), categories ?? []),
    keywords: parseRows("topic keywords", z.array(KeywordRowSchema), keywords ?? []),
    terms: parseRows("context terms", z.array(ContextTermRowSchema), terms ?? []),
    sources: parseRows("community sources", z.array(SourceRowSchema), sources ?? []),
  });
}

export async function listRuns(limit = 10): Promise<RunRecord[]> {
  if (fixtureMode()) return (await fixtures()).sampleRuns.slice(0, limit);
  const rows = await read("pipeline runs", (db) =>
    db.from("pipeline_runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(limit),
  );
  return parseRows("pipeline runs", z.array(z.unknown()), rows ?? []).map(toRun);
}

/** One run for live progress polling; null for an unknown or malformed id. */
export async function getRun(id: string): Promise<RunRecord | null> {
  if (!UUID.test(id)) return null;
  if (fixtureMode()) return (await fixtures()).sampleRuns.find((r) => r.id === id) ?? null;
  const row = await read("the pipeline run", (db) => db.from("pipeline_runs").select(RUN_COLUMNS).eq("id", id).maybeSingle());
  return row === null ? null : toRun(row);
}

/* ----------------------------- Row shapes (snake_case) ----------------------------- */

const BRIEF_COLUMNS = "id, week_end, week_start, status, trigger, generated_at, stats, analysis, quality, delivery";
const RUN_COLUMNS = "id, trigger, week_end, status, started_at, finished_at, steps, error, brief_id";
// PostgREST JSON paths keep the archive query small: no stats/analysis blobs for every week.
const SUMMARY_COLUMNS = [
  "id, week_end, week_start, status, trigger, generated_at",
  "headline:analysis->>headline",
  "mode:analysis->>mode",
  "top_pain_point:analysis->painPoints->0->>title",
  "threads:stats->totals->threads->3",
].join(", ");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BriefRowSchema = z.object({
  id: z.string(),
  week_end: z.string(),
  week_start: z.string(),
  status: z.string(),
  trigger: z.string(),
  generated_at: z.string(),
  stats: z.unknown(),
  analysis: z.unknown(),
  quality: z.unknown(),
  delivery: z.unknown(),
});

const SummaryRowSchema = z.object({
  id: z.string(),
  week_end: z.string(),
  week_start: z.string(),
  status: z.enum(BRIEF_STATUSES),
  trigger: z.enum(TRIGGERS),
  generated_at: z.string(),
  headline: z.string().nullable(),
  mode: z.enum(["ai", "fallback"]).nullable().catch(null),
  top_pain_point: z.string().nullable(),
  threads: z.number().int().nonnegative().nullable().catch(null),
});

const RunRowSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  week_end: z.string(),
  status: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  steps: z.unknown(),
  error: z.string().nullable(),
  brief_id: z.string().nullable(),
});

const CategoryRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  is_active: z.boolean(),
  sort_order: z.number(),
  updated_at: z.string(),
});

const KeywordRowSchema = z.object({
  category_id: z.string(),
  keyword: z.string(),
  requires_context: z.boolean(),
  is_active: z.boolean(),
  updated_at: z.string(),
});

const ContextTermRowSchema = z.object({ term: z.string(), is_active: z.boolean(), created_at: z.string() });

const SourceRowSchema = z.object({
  slug: SourceSlugSchema,
  name: z.string(),
  is_active: z.boolean(),
  config: z.unknown(),
  updated_at: z.string(),
});

const SourceConfigSchema = z.object({
  tags: z.array(z.string()).optional(),
  include_comments: z.boolean().optional(),
});

/* ----------------------------- Mapping + validation ----------------------------- */

/** Maps a `briefs` row to the contract type and validates every JSON column. */
export function toBrief(row: unknown): BriefRecord {
  const r = parseRows("a brief row", BriefRowSchema, row);
  const parsed = BriefRecordSchema.safeParse({
    id: r.id,
    weekEnd: r.week_end,
    weekStart: r.week_start,
    status: r.status,
    trigger: r.trigger,
    generatedAt: r.generated_at,
    stats: r.stats,
    analysis: r.analysis,
    quality: r.quality,
    delivery: r.delivery,
  });
  if (!parsed.success) {
    throw new DataError(
      "invalid",
      `The stored brief for the week ending ${r.week_end} does not match the expected format (${describeIssues(parsed.error)}).`,
    );
  }
  return parsed.data;
}

/** Maps a `pipeline_runs` row to the contract type and validates its steps. */
export function toRun(row: unknown): RunRecord {
  const r = parseRows("a pipeline run row", RunRowSchema, row);
  const parsed = RunRecordSchema.safeParse({
    id: r.id,
    trigger: r.trigger,
    weekEnd: r.week_end,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    steps: r.steps,
    error: r.error,
    briefId: r.brief_id,
  });
  if (!parsed.success) {
    throw new DataError("invalid", `Pipeline run ${r.id} does not match the expected format (${describeIssues(parsed.error)}).`);
  }
  return parsed.data;
}

type ConfigRows = {
  categories: z.infer<typeof CategoryRowSchema>[];
  keywords: z.infer<typeof KeywordRowSchema>[];
  terms: z.infer<typeof ContextTermRowSchema>[];
  sources: z.infer<typeof SourceRowSchema>[];
};

export function toTopicConfig({ categories, keywords, terms, sources }: ConfigRows): TopicConfigView {
  const byCategory = new Map<string, TopicKeywordView[]>();
  for (const k of keywords) {
    const list = byCategory.get(k.category_id) ?? [];
    list.push({ keyword: k.keyword, requiresContext: k.requires_context, isActive: k.is_active });
    byCategory.set(k.category_id, list);
  }
  const alpha = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });
  const timestamps = [
    ...categories.map((c) => c.updated_at),
    ...keywords.map((k) => k.updated_at),
    ...terms.map((t) => t.created_at),
    ...sources.map((s) => s.updated_at),
  ];

  return {
    categories: categories
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        isActive: c.is_active,
        sortOrder: c.sort_order,
        updatedAt: c.updated_at,
        keywords: (byCategory.get(c.id) ?? []).sort((a, b) => Number(b.isActive) - Number(a.isActive) || alpha(a.keyword, b.keyword)),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || alpha(a.name, b.name)),
    contextTerms: terms
      .map((t) => ({ term: t.term, isActive: t.is_active }))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || alpha(a.term, b.term)),
    sources: sources
      .map((s) => {
        const config = SourceConfigSchema.safeParse(s.config ?? {});
        return {
          slug: s.slug,
          name: s.name,
          isActive: s.is_active,
          tags: config.success ? (config.data.tags ?? []) : [],
          includeComments: config.success ? (config.data.include_comments ?? false) : false,
          configIssue: config.success ? null : `config JSON not understood (${describeIssues(config.error)})`,
          updatedAt: s.updated_at,
        };
      })
      .sort((a, b) => SOURCE_ORDER.indexOf(a.slug) - SOURCE_ORDER.indexOf(b.slug)),
    lastUpdated: latest(timestamps),
  };
}

const SOURCE_ORDER: SourceSlug[] = ["hackernews", "stackoverflow", "devto"];

function latest(isoList: string[]): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const iso of isoList) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t > bestTime) {
      best = iso;
      bestTime = t;
    }
  }
  return best;
}

function parseRows<T>(what: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new DataError("invalid", `Supabase returned ${what} in an unexpected shape (${describeIssues(parsed.error)}).`);
  }
  return parsed.data;
}

function describeIssues(error: z.ZodError): string {
  const shown = error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "row"}: ${i.message}`);
  const more = error.issues.length - shown.length;
  return more > 0 ? `${shown.join("; ")}; and ${more} more` : shown.join("; ");
}

/* ----------------------------- Supabase access ----------------------------- */

type QueryResult = { data: unknown; error: { message: string } | null };
type Db = ReturnType<typeof supabase>;

async function read(what: string, query: (db: Db) => PromiseLike<QueryResult>): Promise<unknown> {
  // Request time only: even a "not configured" error must never be baked into a prerendered shell.
  await connection();
  let db: Db;
  try {
    db = supabase();
  } catch (error) {
    throw new DataError("not-configured", messageOf(error));
  }
  let result: QueryResult;
  try {
    result = await query(db);
  } catch (error) {
    throw new DataError("unreachable", `Could not reach Supabase while loading ${what}: ${messageOf(error)}`);
  }
  if (result.error) {
    throw new DataError("unreachable", `Supabase returned an error while loading ${what}: ${result.error.message}`);
  }
  return result.data;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ----------------------------- Local fixture mode ----------------------------- */

function fixtureMode(): boolean {
  return process.env.PULSE_FIXTURE === "1";
}

async function fixtures() {
  // Mirror live mode: render at request time, never bake sample data into the static shell.
  await connection();
  const [briefs, topics] = await Promise.all([import("@/fixtures/sample-brief"), import("@/fixtures/sample-topics")]);
  return { ...briefs, ...topics };
}
