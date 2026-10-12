import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { SOURCE_SLUGS, type PulseConfig, type SourceConfig, type SourceSlug, type TopicCategory, type TopicKeyword } from "../contracts";
import { supabase } from "../supabase";

/*
 * Load step: what Sumit monitors lives in Supabase (topic_categories, topic_keywords, context_terms,
 * community_sources), so he changes it in the Table Editor and the next run picks it up, no deploy.
 * Only active rows count. configHash fingerprints everything that changes what a post means
 * (categories, their keywords, context terms; not sources), so cached AI classifications are reused
 * only while that is unchanged. Anything skipped while loading is reported in `notes`, never silent.
 */

const KeywordRowSchema = z.object({ keyword: z.string(), requires_context: z.boolean(), is_active: z.boolean() });
const CategoryRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  sort_order: z.number(),
  topic_keywords: z.array(KeywordRowSchema).nullable(),
});
const TermRowSchema = z.object({ term: z.string(), is_active: z.boolean() });
const SourceRowSchema = z.object({ slug: z.string(), name: z.string(), is_active: z.boolean(), config: z.unknown() });
const SourceSettingsSchema = z.object({ tags: z.unknown().optional(), include_comments: z.unknown().optional() });

export type ConfigRows = {
  categories: z.infer<typeof CategoryRowSchema>[];
  contextTerms: z.infer<typeof TermRowSchema>[];
  sources: z.infer<typeof SourceRowSchema>[];
};

export type LoadedConfig = PulseConfig & {
  /** Human-readable remarks about rows that were skipped or look misconfigured. */
  notes: string[];
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isSourceSlug = (slug: string): slug is SourceSlug => (SOURCE_SLUGS as readonly string[]).includes(slug);

/** SHA-256 of a canonical JSON of categories (by slug) with sorted keywords, plus sorted context terms. */
export function configHash(categories: readonly TopicCategory[], contextTerms: readonly string[]): string {
  const canonical = {
    categories: [...categories]
      .sort((a, b) => compareText(a.slug, b.slug))
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        keywords: [...c.keywords]
          .sort((a, b) => compareText(a.keyword, b.keyword) || Number(a.requiresContext) - Number(b.requiresContext))
          .map((k) => ({ keyword: k.keyword, requiresContext: k.requiresContext })),
      })),
    contextTerms: [...contextTerms].sort(compareText),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function sourceConfig(row: z.infer<typeof SourceRowSchema>, slug: SourceSlug, notes: string[]): SourceConfig {
  const settings = SourceSettingsSchema.safeParse(row.config ?? {});
  const raw = settings.success ? settings.data : {};
  const tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    for (const tag of raw.tags) {
      const clean = typeof tag === "string" ? tag.trim().toLowerCase() : "";
      if (clean && !tags.includes(clean)) tags.push(clean);
    }
  } else if (raw.tags !== undefined) {
    notes.push(`Source "${slug}": config.tags is not a list of strings; using no tags.`);
  }
  const includeComments = typeof raw.include_comments === "boolean" ? raw.include_comments : true;
  return { slug, name: row.name.trim() || slug, isActive: row.is_active, tags, includeComments };
}

/** Pure part of loadConfig: turns raw Supabase rows into the run's config. Throws when nothing can match. */
export function buildConfig(rows: ConfigRows): LoadedConfig {
  const notes: string[] = [];

  const categories: TopicCategory[] = [];
  const activeCategories = rows.categories
    .filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || compareText(a.slug, b.slug));
  for (const row of activeCategories) {
    const seen = new Set<string>();
    const keywords: TopicKeyword[] = [];
    for (const k of row.topic_keywords ?? []) {
      const keyword = k.keyword.trim();
      if (!k.is_active || !keyword) continue;
      const key = keyword.toLowerCase();
      if (seen.has(key)) {
        notes.push(`Category "${row.slug}": duplicate keyword "${keyword}" ignored (differs only in case).`);
        continue;
      }
      seen.add(key);
      keywords.push({ keyword, requiresContext: k.requires_context });
    }
    if (keywords.length === 0) {
      notes.push(`Category "${row.slug}" skipped: it has no active keywords.`);
      continue;
    }
    keywords.sort((a, b) => compareText(a.keyword.toLowerCase(), b.keyword.toLowerCase()) || compareText(a.keyword, b.keyword));
    categories.push({
      id: row.id,
      slug: row.slug,
      name: row.name.trim(),
      description: (row.description ?? "").trim(),
      sortOrder: row.sort_order,
      keywords,
    });
  }
  if (categories.length === 0) {
    throw new Error(
      "No active keywords in Supabase: activate at least one topic_keywords row in an active topic_categories row, then run again.",
    );
  }

  const contextTerms: string[] = [];
  const seenTerms = new Set<string>();
  for (const row of rows.contextTerms) {
    const term = row.term.trim();
    if (!row.is_active || !term || seenTerms.has(term.toLowerCase())) continue;
    seenTerms.add(term.toLowerCase());
    contextTerms.push(term);
  }
  contextTerms.sort((a, b) => compareText(a.toLowerCase(), b.toLowerCase()) || compareText(a, b));
  const needContext = categories.reduce((n, c) => n + c.keywords.filter((k) => k.requiresContext).length, 0);
  if (contextTerms.length === 0 && needContext > 0) {
    notes.push(`No active context terms: ${needContext} keywords marked requires_context can never match.`);
  }

  const sources: SourceConfig[] = [];
  for (const row of rows.sources) {
    if (!isSourceSlug(row.slug)) {
      notes.push(`Source row "${row.slug}" ignored: unknown source.`);
      continue;
    }
    sources.push(sourceConfig(row, row.slug, notes));
  }
  sources.sort((a, b) => SOURCE_SLUGS.indexOf(a.slug) - SOURCE_SLUGS.indexOf(b.slug));

  return { categories, contextTerms, sources, configHash: configHash(categories, contextTerms), notes };
}

function parseRows<T extends z.ZodType>(schema: T, table: string, result: { data: unknown; error: { message: string } | null }): z.infer<T>[] {
  if (result.error) throw new Error(`Could not read ${table} from Supabase: ${result.error.message}`);
  const parsed = z.array(schema).safeParse(result.data ?? []);
  if (!parsed.success) throw new Error(`Unexpected ${table} rows from Supabase: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export async function loadConfig(): Promise<LoadedConfig> {
  const db = supabase();
  const [categories, contextTerms, sources] = await Promise.all([
    db
      .from("topic_categories")
      .select("id, slug, name, description, is_active, sort_order, topic_keywords(keyword, requires_context, is_active)"),
    db.from("context_terms").select("term, is_active"),
    db.from("community_sources").select("slug, name, is_active, config"),
  ]);
  return buildConfig({
    categories: parseRows(CategoryRowSchema, "topic_categories", categories),
    contextTerms: parseRows(TermRowSchema, "context_terms", contextTerms),
    sources: parseRows(SourceRowSchema, "community_sources", sources),
  });
}
