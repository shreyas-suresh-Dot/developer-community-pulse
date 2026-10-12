import { SOURCE_NAMES, SOURCE_SLUGS, type PulseConfig, type SourceConfig, type SourceSlug, type Week } from "../../contracts";
import type { FetchContext, SourceResult } from "../types";
import { fetchDevTo } from "./devto";
import { fetchHackerNews } from "./hackernews";
import { fetchStackOverflow } from "./stackoverflow";

/*
 * Collect step: every active community source runs in parallel over the 4-week window. Sources never
 * throw and a failing one is isolated, so the brief degrades to "partial" instead of failing. Posts
 * outside the window (DEV's top=N listing reaches past both ends) are dropped here, so every count
 * downstream uses exactly one window. Disabled or missing sources still get a result row, so the
 * quality panel always lists all three.
 */

type Fetcher = (source: SourceConfig, config: PulseConfig, weeks: Week[], ctx: FetchContext) => Promise<SourceResult>;

const FETCHERS: Record<SourceSlug, Fetcher> = {
  hackernews: (source, config, weeks, ctx) => fetchHackerNews(source, config, weeks, ctx),
  stackoverflow: (source, _config, weeks, ctx) => fetchStackOverflow(source, weeks, ctx),
  devto: (source, _config, weeks, ctx) => fetchDevTo(source, weeks, ctx),
};

function idle(slug: SourceSlug, name: string, note: string): SourceResult {
  return { source: slug, name, ok: true, items: [], requests: 0, ms: 0, error: null, notes: [note] };
}

async function runSource(slug: SourceSlug, source: SourceConfig, config: PulseConfig, weeks: Week[], ctx: FetchContext): Promise<SourceResult> {
  const started = Date.now();
  let result: SourceResult;
  try {
    result = await FETCHERS[slug](source, config, weeks, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source: slug, name: source.name, ok: false, items: [], requests: 0, ms: Date.now() - started, error: `Unexpected error: ${message}`, notes: [] };
  }

  const start = Date.parse(weeks[0].start);
  const end = Date.parse(weeks[weeks.length - 1].end);
  const items = result.items.filter((item) => {
    const t = Date.parse(item.postedAt);
    return t >= start && t < end;
  });
  const outside = result.items.length - items.length;
  const notes = outside > 0 ? [...result.notes, `${outside} posts outside the 4-week window ignored.`] : result.notes;
  return { ...result, items, notes };
}

export async function collectAll(config: PulseConfig, weeks: Week[], ctx: FetchContext): Promise<SourceResult[]> {
  return Promise.all(
    SOURCE_SLUGS.map((slug) => {
      const source = config.sources.find((s) => s.slug === slug);
      if (!source) return Promise.resolve(idle(slug, SOURCE_NAMES[slug], "Not configured in Supabase (no community_sources row)."));
      if (!source.isActive) return Promise.resolve(idle(slug, source.name, "Disabled in Supabase"));
      return runSource(slug, source, config, weeks, ctx);
    }),
  );
}
