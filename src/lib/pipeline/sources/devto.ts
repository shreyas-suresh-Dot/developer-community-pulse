import { z } from "zod";
import type { SourceConfig, Week } from "../../contracts";
import type { FetchContext, RawMention, SourceResult } from "../types";
import { createHttpClient, mapPool } from "./http";
import { collapseWhitespace, excerpt, joinText } from "./text";

/*
 * DEV Community via the public Forem API, one listing per configured tag.
 *
 * Ordering, measured on 2026-10-12: `/api/articles?tag=X` is NOT date-ordered. It follows an internal
 * hotness score: on [codereview] 38 of 99 neighbouring pairs were out of date order and a post from
 * 9 Oct sat behind posts from 17 Sep, so "page until older than the window" silently misses posts.
 * `top=N` returns every article published in the last N days (ordered by engagement, not date): on
 * [codereview] its 3 pages held all 182 in-window posts of the plain listing plus 4 that the plain
 * listing had not shown even after paging back to 7 Aug. So we request top = days since the window start (+1 margin), page until a
 * short page, at most 5 pages per tag, and keep in-window posts. A tag with more than 500 posts in
 * that span (e.g. [devops], ~130 posts/day) hits the cap; it then contributes its 500 most-engaged
 * posts and the cap is noted. The listing carries title, description and tags, not the body.
 */

const API_URL = "https://dev.to/api/articles";
const PER_PAGE = 100;
export const DEVTO_MAX_PAGES = 5;
const CONCURRENCY = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const ArticleSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullish(),
  url: z.string(),
  published_at: z.string(),
  tag_list: z.union([z.array(z.string()), z.string()]).nullish(),
  comments_count: z.number().nullish(),
  public_reactions_count: z.number().nullish(),
  user: z.object({ username: z.string().nullish(), name: z.string().nullish() }).nullish(),
});
export type DevArticle = z.infer<typeof ArticleSchema>;

/** Days to pass as `top` so the listing reaches back to the window start. */
export function topDays(windowStart: string, now: number = Date.now()): number {
  return Math.max(1, Math.ceil((now - Date.parse(windowStart)) / DAY_MS) + 1);
}

function tagsOf(article: DevArticle): string[] {
  const raw = article.tag_list ?? [];
  const list = Array.isArray(raw) ? raw : raw.split(",");
  return list.map((t) => t.trim()).filter(Boolean);
}

export function articleToMention(article: DevArticle): RawMention | null {
  const postedAt = Date.parse(article.published_at);
  if (Number.isNaN(postedAt)) return null;
  const title = collapseWhitespace(article.title);
  const description = collapseWhitespace(article.description ?? "");
  const engagement: RawMention["engagement"] = {};
  if (typeof article.comments_count === "number") engagement.comments = article.comments_count;
  if (typeof article.public_reactions_count === "number") engagement.reactions = article.public_reactions_count;
  return {
    source: "devto",
    externalId: String(article.id),
    kind: "article",
    threadKey: `devto:${article.id}`,
    threadTitle: title,
    url: article.url,
    threadUrl: article.url,
    text: joinText(title, description, tagsOf(article).join(", ")),
    contextText: "",
    excerpt: excerpt(description || title),
    author: article.user?.username ?? article.user?.name ?? null,
    postedAt: new Date(postedAt).toISOString(),
    engagement,
  };
}

type TagResult = { succeeded: number; failure: string | null; skipped: boolean; capped: boolean; articles: unknown[] };

export async function fetchDevTo(source: SourceConfig, weeks: Week[], ctx: FetchContext): Promise<SourceResult> {
  const started = Date.now();
  const http = createHttpClient(ctx);
  const notes: string[] = [];
  const done = (ok: boolean, items: RawMention[], error: string | null): SourceResult => ({
    source: "devto",
    name: source.name,
    ok,
    items,
    requests: http.requests,
    ms: Date.now() - started,
    error,
    notes,
  });

  try {
    if (source.tags.length === 0) {
      notes.push("No tags configured (community_sources.config.tags is empty).");
      return done(true, [], null);
    }
    const top = topDays(weeks[0].start);

    const results = await mapPool(source.tags, CONCURRENCY, async (tag): Promise<TagResult> => {
      const result: TagResult = { succeeded: 0, failure: null, skipped: false, capped: false, articles: [] };
      for (let page = 1; page <= DEVTO_MAX_PAGES; page++) {
        const params = new URLSearchParams({ tag, top: String(top), per_page: String(PER_PAGE), page: String(page) });
        const res = await http.getJson(`${API_URL}?${params}`, `DEV [${tag}] page ${page}`);
        if (!res.ok) {
          result.skipped = res.skipped;
          if (!res.skipped) result.failure = res.error;
          break;
        }
        if (!Array.isArray(res.data)) {
          result.failure = `DEV [${tag}] page ${page}: unexpected response shape`;
          break;
        }
        result.succeeded++;
        result.articles.push(...res.data);
        if (res.data.length < PER_PAGE) break;
        if (page === DEVTO_MAX_PAGES) result.capped = true;
      }
      return result;
    });

    const byId = new Map<string, RawMention>();
    let malformed = 0;
    for (const result of results) {
      for (const raw of result.articles) {
        const article = ArticleSchema.safeParse(raw);
        const mention = article.success ? articleToMention(article.data) : null;
        if (!mention) {
          malformed++;
          continue;
        }
        if (!byId.has(mention.externalId)) byId.set(mention.externalId, mention);
      }
    }

    const succeeded = results.reduce((n, r) => n + r.succeeded, 0);
    const failures = results.flatMap((r) => (r.failure ? [r.failure] : []));
    const capped = source.tags.filter((_, i) => results[i].capped);
    const skipped = source.tags.filter((_, i) => results[i].skipped);

    notes.push(`${source.tags.length} tags via top=${top} (published in the last ${top} days, most-engaged first); ${byId.size} distinct articles fetched.`);
    if (capped.length) {
      notes.push(
        `Capped at ${DEVTO_MAX_PAGES * PER_PAGE} articles per tag (more exist), so only the most-engaged articles count for: ${capped.map((t) => `[${t}]`).join(", ")}.`,
      );
    }
    if (failures.length) notes.push(`Incomplete: ${failures.length} tags failed: ${failures.slice(0, 5).join("; ")}.`);
    if (skipped.length) notes.push(`Stopped early (time budget reached) for: ${skipped.map((t) => `[${t}]`).join(", ")}.`);
    if (malformed) notes.push(`${malformed} articles skipped (unexpected shape).`);

    if (succeeded === 0) return done(false, [], failures[0] ?? "No DEV request could be completed (time budget reached).");
    return done(true, [...byId.values()], null);
  } catch (err) {
    return done(false, [], `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
