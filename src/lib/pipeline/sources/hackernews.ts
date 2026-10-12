import { z } from "zod";
import type { Engagement, PulseConfig, SourceConfig, Week } from "../../contracts";
import type { FetchContext, RawMention, SourceResult } from "../types";
import { createHttpClient, mapPool, type HttpClient } from "./http";
import { collapseWhitespace, excerpt, htmlToText, joinText } from "./text";

/*
 * Hacker News via the Algolia search API: one date-filtered phrase search per keyword over the whole
 * 4-week window (stories, plus comments unless disabled), newest first, up to 1000 hits per query.
 *
 * Measured on 2026-10-12: Algolia phrase queries do not fold plurals ("flaky test" → 0 hits,
 * "flaky tests" → 4; "false positive" 96 vs "false positives" 156), so the plural spelling is searched
 * too, mirroring the matcher's plural tolerance. A search with more hits than one page is re-run per
 * week and anything still truncated is noted. Comments carry no score on HN, so a comment carries its
 * story's points/comment count: from a story hit in the results, or from the Firebase item API for
 * the busiest comment-only threads (capped, and the cap is noted).
 */

const SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const ITEM_URL = "https://hacker-news.firebaseio.com/v0/item";
const HITS_PER_PAGE = 1000;
export const HN_CONCURRENCY = 6;
export const HN_ENRICH_CAP = 60;

const ATTRIBUTES = [
  "objectID",
  "created_at_i",
  "author",
  "title",
  "story_text",
  "comment_text",
  "story_id",
  "story_title",
  "points",
  "num_comments",
  "_tags",
];

const HitSchema = z.object({
  objectID: z.string(),
  created_at_i: z.number(),
  author: z.string().nullish(),
  title: z.string().nullish(),
  story_text: z.string().nullish(),
  comment_text: z.string().nullish(),
  story_id: z.number().nullish(),
  story_title: z.string().nullish(),
  points: z.number().nullish(),
  num_comments: z.number().nullish(),
  _tags: z.array(z.string()).nullish(),
});
export type HnHit = z.infer<typeof HitSchema>;

const SearchSchema = z.object({ hits: z.array(z.unknown()), nbHits: z.number() });

const ItemSchema = z
  .object({ score: z.number().optional(), descendants: z.number().optional(), title: z.string().optional() })
  .nullable();

const ENDS_WITH_LETTER = new RegExp("\\p{L}$", "u");

const itemUrl = (id: string) => `https://news.ycombinator.com/item?id=${id}`;

function engagementOf(points: number | null | undefined, comments: number | null | undefined): Engagement {
  const engagement: Engagement = {};
  if (typeof points === "number") engagement.points = points;
  if (typeof comments === "number") engagement.comments = comments;
  return engagement;
}

/** Phrases searched for one keyword: itself and, when it ends in a letter other than "s", its plural. */
export function searchPhrases(keyword: string): string[] {
  const phrase = collapseWhitespace(keyword.replace(/"/g, " "));
  if (!phrase) return [];
  if (!ENDS_WITH_LETTER.test(phrase) || /s$/i.test(phrase)) return [phrase];
  return [phrase, /(x|z|ch|sh)$/i.test(phrase) ? `${phrase}es` : `${phrase}s`];
}

/** Distinct phrases for every active keyword, case-insensitively deduplicated, in config order. */
export function phrasesFor(config: PulseConfig): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const category of config.categories) {
    for (const { keyword } of category.keywords) {
      for (const phrase of searchPhrases(keyword)) {
        const key = phrase.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        phrases.push(phrase);
      }
    }
  }
  return phrases;
}

export function hitToMention(hit: HnHit): RawMention | null {
  const tags = hit._tags ?? [];
  const postedAt = new Date(hit.created_at_i * 1000).toISOString();
  const author = hit.author ?? null;

  if (tags.includes("comment")) {
    const body = htmlToText(hit.comment_text);
    if (!body) return null;
    const threadId = typeof hit.story_id === "number" ? String(hit.story_id) : hit.objectID;
    const storyTitle = collapseWhitespace(hit.story_title ?? "");
    return {
      source: "hackernews",
      externalId: hit.objectID,
      kind: "comment",
      threadKey: `hackernews:${threadId}`,
      threadTitle: storyTitle || "(untitled thread)",
      url: itemUrl(hit.objectID),
      threadUrl: itemUrl(threadId),
      text: body,
      contextText: storyTitle,
      excerpt: excerpt(body),
      author,
      postedAt,
      engagement: {},
    };
  }

  if (tags.includes("story")) {
    const title = collapseWhitespace(hit.title ?? "");
    const body = htmlToText(hit.story_text);
    if (!title && !body) return null;
    return {
      source: "hackernews",
      externalId: hit.objectID,
      kind: "story",
      threadKey: `hackernews:${hit.objectID}`,
      threadTitle: title || "(untitled)",
      url: itemUrl(hit.objectID),
      threadUrl: itemUrl(hit.objectID),
      text: joinText(title, body),
      contextText: "",
      excerpt: excerpt(body || title),
      author,
      postedAt,
      engagement: engagementOf(hit.points, hit.num_comments),
    };
  }
  return null;
}

type Range = { start: number; end: number; label: string };
type SearchOutcome = { ok: true; hits: unknown[]; nbHits: number } | { ok: false; error: string; skipped: boolean };

const toUnix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

async function search(http: HttpClient, phrase: string, range: Range, tags: string): Promise<SearchOutcome> {
  const params = new URLSearchParams({
    query: `"${phrase}"`,
    tags,
    numericFilters: `created_at_i>=${range.start},created_at_i<${range.end}`,
    hitsPerPage: String(HITS_PER_PAGE),
    attributesToHighlight: "[]",
    attributesToRetrieve: JSON.stringify(ATTRIBUTES),
  });
  const res = await http.getJson(`${SEARCH_URL}?${params}`, `HN search "${phrase}"${range.label ? ` (${range.label})` : ""}`);
  if (!res.ok) return { ok: false, error: res.error, skipped: res.skipped };
  const parsed = SearchSchema.safeParse(res.data);
  if (!parsed.success) return { ok: false, error: `HN search "${phrase}": unexpected response shape`, skipped: false };
  return { ok: true, hits: parsed.data.hits, nbHits: parsed.data.nbHits };
}

type PhraseResult = { hits: unknown[]; succeeded: number; failures: string[]; skipped: number; requeried: boolean; truncated: string[] };

async function searchPhraseInWindow(http: HttpClient, phrase: string, weeks: Week[], tags: string): Promise<PhraseResult> {
  const result: PhraseResult = { hits: [], succeeded: 0, failures: [], skipped: 0, requeried: false, truncated: [] };
  const whole: Range = { start: toUnix(weeks[0].start), end: toUnix(weeks[weeks.length - 1].end), label: "" };
  const first = await search(http, phrase, whole, tags);
  if (!first.ok) {
    if (first.skipped) result.skipped++;
    else result.failures.push(first.error);
    return result;
  }
  result.succeeded++;
  result.hits.push(...first.hits);
  if (first.nbHits <= first.hits.length) return result;

  result.requeried = true;
  for (const week of weeks) {
    const weekly = await search(http, phrase, { start: toUnix(week.start), end: toUnix(week.end), label: week.label }, tags);
    if (!weekly.ok) {
      if (weekly.skipped) result.skipped++;
      else result.failures.push(weekly.error);
      continue;
    }
    result.succeeded++;
    result.hits.push(...weekly.hits);
    if (weekly.nbHits > weekly.hits.length) {
      result.truncated.push(`"${phrase}" in ${week.label}: ${weekly.hits.length} of ${weekly.nbHits} hits`);
    }
  }
  return result;
}

/** Story points/comment counts for threads that only appear through comments, busiest threads first. */
async function enrichCommentOnlyThreads(http: HttpClient, mentions: RawMention[], notes: string[]): Promise<RawMention[]> {
  const threadEngagement = new Map<string, Engagement>();
  const titles = new Map<string, string>();
  for (const m of mentions) if (m.kind === "story") threadEngagement.set(m.threadKey, m.engagement);

  const commentHits = new Map<string, number>();
  for (const m of mentions) {
    if (m.kind === "comment" && !threadEngagement.has(m.threadKey)) {
      commentHits.set(m.threadKey, (commentHits.get(m.threadKey) ?? 0) + 1);
    }
  }
  const ranked = [...commentHits.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const chosen = ranked.slice(0, HN_ENRICH_CAP).map(([threadKey]) => threadKey);

  let failed = 0;
  await mapPool(chosen, HN_CONCURRENCY, async (threadKey) => {
    const id = threadKey.slice("hackernews:".length);
    const res = await http.getJson(`${ITEM_URL}/${id}.json`, `HN item ${id}`);
    const item = res.ok ? ItemSchema.safeParse(res.data) : null;
    if (!item?.success || !item.data) {
      failed++;
      return;
    }
    threadEngagement.set(threadKey, engagementOf(item.data.score, item.data.descendants));
    if (item.data.title) titles.set(threadKey, collapseWhitespace(item.data.title));
  });

  if (ranked.length > 0) {
    const enriched = chosen.length - failed;
    const cap = ranked.length > HN_ENRICH_CAP ? `; capped at the ${HN_ENRICH_CAP} with most matching comments` : "";
    notes.push(`Story points/comments looked up for ${enriched} of ${ranked.length} threads seen only through comments${cap}.`);
  }

  return mentions.map((m) => {
    if (m.kind !== "comment") return m;
    const engagement = threadEngagement.get(m.threadKey);
    const title = m.threadTitle === "(untitled thread)" ? titles.get(m.threadKey) : undefined;
    return engagement || title ? { ...m, engagement: engagement ? { ...engagement } : m.engagement, threadTitle: title ?? m.threadTitle } : m;
  });
}

export async function fetchHackerNews(
  source: SourceConfig,
  config: PulseConfig,
  weeks: Week[],
  ctx: FetchContext,
): Promise<SourceResult> {
  const started = Date.now();
  const http = createHttpClient(ctx);
  const notes: string[] = [];
  const done = (ok: boolean, items: RawMention[], error: string | null): SourceResult => ({
    source: "hackernews",
    name: source.name,
    ok,
    items,
    requests: http.requests,
    ms: Date.now() - started,
    error,
    notes,
  });

  try {
    const phrases = phrasesFor(config);
    if (phrases.length === 0) {
      notes.push("No active keywords to search.");
      return done(true, [], null);
    }
    const tags = source.includeComments ? "(story,comment)" : "story";
    const results = await mapPool(phrases, HN_CONCURRENCY, (phrase) => searchPhraseInWindow(http, phrase, weeks, tags));

    const byId = new Map<string, RawMention>();
    let malformed = 0;
    for (const result of results) {
      for (const raw of result.hits) {
        const hit = HitSchema.safeParse(raw);
        const mention = hit.success ? hitToMention(hit.data) : null;
        if (!mention) {
          malformed++;
          continue;
        }
        if (!byId.has(mention.externalId)) byId.set(mention.externalId, mention);
      }
    }

    const succeeded = results.reduce((n, r) => n + r.succeeded, 0);
    const failures = results.flatMap((r) => r.failures);
    const skipped = results.reduce((n, r) => n + r.skipped, 0);
    const requeried = phrases.filter((_, i) => results[i].requeried);
    const truncated = results.flatMap((r) => r.truncated);

    notes.push(
      `Searched ${phrases.length} phrases (keywords plus plural spellings) over ${weeks.length} weeks, ${source.includeComments ? "stories and comments" : "stories only"}.`,
    );
    if (requeried.length) notes.push(`More than ${HITS_PER_PAGE} hits over 4 weeks, re-queried per week: ${requeried.map((p) => `"${p}"`).join(", ")}.`);
    if (truncated.length) notes.push(`Incomplete: Algolia returns at most ${HITS_PER_PAGE} hits per query: ${truncated.join("; ")}.`);
    if (failures.length) notes.push(`Incomplete: ${failures.length} searches failed: ${failures.slice(0, 5).join("; ")}${failures.length > 5 ? "; …" : ""}.`);
    if (skipped) notes.push(`Stopped early: ${skipped} searches not sent (time budget reached).`);
    if (malformed) notes.push(`${malformed} hits skipped (empty or unexpected shape).`);

    if (succeeded === 0) {
      return done(false, [], failures[0] ?? "No Hacker News search could be completed (time budget reached).");
    }

    const items = await enrichCommentOnlyThreads(http, [...byId.values()], notes);
    return done(true, items, null);
  } catch (err) {
    return done(false, [], `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
