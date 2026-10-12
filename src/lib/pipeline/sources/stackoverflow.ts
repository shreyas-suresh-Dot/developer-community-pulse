import { z } from "zod";
import type { SourceConfig, Week } from "../../contracts";
import type { FetchContext, RawMention, SourceResult } from "../types";
import { createHttpClient, sleep } from "./http";
import { collapseWhitespace, decodeEntities, excerpt, htmlToText, joinText } from "./text";

/*
 * Stack Overflow via the Stack Exchange API: the questions created inside the window for each
 * configured tag (newest first, body included), up to 3 pages of 100 per tag. Without an app key the
 * API allows 300 requests per day per IP, so requests are sequential, the `backoff` field is honoured,
 * and a throttle violation or an exhausted quota stops the source with a note (the questions fetched
 * so far are kept). Tags are part of the matched text, so a question tagged `github-actions` counts
 * for the "GitHub Actions" keyword even when its title does not repeat it.
 */

const API_URL = "https://api.stackexchange.com/2.3/questions";
const PAGE_SIZE = 100;
export const SO_MAX_PAGES = 3;

const QuestionSchema = z.object({
  question_id: z.number(),
  title: z.string(),
  link: z.string(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  owner: z.object({ display_name: z.string().optional() }).optional(),
  is_answered: z.boolean().optional(),
  view_count: z.number().optional(),
  answer_count: z.number().optional(),
  score: z.number().optional(),
  creation_date: z.number(),
  accepted_answer_id: z.number().optional(),
});
export type SoQuestion = z.infer<typeof QuestionSchema>;

const WrapperSchema = z.object({
  items: z.array(z.unknown()).optional(),
  has_more: z.boolean().optional(),
  quota_max: z.number().optional(),
  quota_remaining: z.number().optional(),
  backoff: z.number().optional(),
  error_id: z.number().optional(),
  error_name: z.string().optional(),
  error_message: z.string().optional(),
});

const THROTTLE_ERROR_ID = 502;

export function questionToMention(q: SoQuestion): RawMention {
  const title = collapseWhitespace(decodeEntities(q.title));
  const body = htmlToText(q.body);
  const tags = q.tags ?? [];
  const engagement: RawMention["engagement"] = {
    isAnswered: q.is_answered ?? false,
    hasAcceptedAnswer: typeof q.accepted_answer_id === "number",
  };
  if (typeof q.score === "number") engagement.points = q.score;
  if (typeof q.answer_count === "number") engagement.answers = q.answer_count;
  if (typeof q.view_count === "number") engagement.views = q.view_count;
  return {
    source: "stackoverflow",
    externalId: String(q.question_id),
    kind: "question",
    threadKey: `stackoverflow:${q.question_id}`,
    threadTitle: title,
    url: q.link,
    threadUrl: q.link,
    text: joinText(title, body, tags.join(", ")),
    contextText: "",
    excerpt: excerpt(body || title),
    author: q.owner?.display_name ? collapseWhitespace(decodeEntities(q.owner.display_name)) : null,
    postedAt: new Date(q.creation_date * 1000).toISOString(),
    engagement,
  };
}

function questionsUrl(tag: string, page: number, fromDate: number, toDate: number, key: string | undefined): string {
  const params = new URLSearchParams({
    tagged: tag,
    site: "stackoverflow",
    fromdate: String(fromDate),
    todate: String(toDate),
    sort: "creation",
    order: "desc",
    pagesize: String(PAGE_SIZE),
    page: String(page),
    filter: "withbody",
  });
  if (key) params.set("key", key);
  return `${API_URL}?${params}`;
}

export async function fetchStackOverflow(source: SourceConfig, weeks: Week[], ctx: FetchContext): Promise<SourceResult> {
  const started = Date.now();
  const http = createHttpClient(ctx);
  const notes: string[] = [];
  const done = (ok: boolean, items: RawMention[], error: string | null): SourceResult => ({
    source: "stackoverflow",
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
    const key = process.env.STACKEXCHANGE_KEY?.trim() || undefined;
    // fromdate and todate are inclusive whole seconds; the window end is exclusive.
    const fromDate = Math.floor(Date.parse(weeks[0].start) / 1000);
    const toDate = Math.floor(Date.parse(weeks[weeks.length - 1].end) / 1000) - 1;

    const byId = new Map<string, RawMention>();
    const failures: string[] = [];
    const capped: string[] = [];
    const notFetched: string[] = [];
    let succeeded = 0;
    let malformed = 0;
    let backoffUntil = 0;
    let quota: { remaining: number; max: number | null } | null = null;
    let stopped: string | null = null;
    let stoppedAt: string | null = null;

    for (const tag of source.tags) {
      if (stopped) {
        notFetched.push(tag);
        continue;
      }
      for (let page = 1; page <= SO_MAX_PAGES; page++) {
        const wait = backoffUntil - Date.now();
        if (wait > 0) {
          if (Date.now() + wait >= ctx.deadline) {
            stopped = "time budget reached while honouring the API's backoff";
            break;
          }
          await sleep(wait, ctx.signal);
        }

        const res = await http.getJson(questionsUrl(tag, page, fromDate, toDate, key), `Stack Overflow [${tag}] page ${page}`);
        const wrapper = WrapperSchema.safeParse(res.data);
        const body = wrapper.success ? wrapper.data : null;
        if (body?.backoff) {
          backoffUntil = Date.now() + body.backoff * 1000;
          notes.push(`API asked to back off ${body.backoff} s after [${tag}] page ${page}; honoured.`);
        }
        if (typeof body?.quota_remaining === "number") quota = { remaining: body.quota_remaining, max: body.quota_max ?? null };

        if (!res.ok) {
          if (res.skipped) {
            stopped = "time budget reached";
          } else if (body?.error_id === THROTTLE_ERROR_ID || body?.error_name === "throttle_violation") {
            stopped = `throttled by Stack Exchange${body.error_message ? ` (${body.error_message})` : ""}`;
          } else {
            failures.push(`${res.error}${body?.error_message ? ` (${body.error_message})` : ""}`);
          }
          break;
        }
        if (!body) {
          failures.push(`Stack Overflow [${tag}] page ${page}: unexpected response shape`);
          break;
        }

        succeeded++;
        for (const raw of body.items ?? []) {
          const question = QuestionSchema.safeParse(raw);
          if (!question.success) {
            malformed++;
            continue;
          }
          const mention = questionToMention(question.data);
          if (!byId.has(mention.externalId)) byId.set(mention.externalId, mention);
        }

        if (body.quota_remaining === 0) {
          stopped = "daily API quota exhausted";
          break;
        }
        if (!body.has_more) break;
        if (page === SO_MAX_PAGES) capped.push(tag);
      }
      if (stopped && !stoppedAt) stoppedAt = tag;
    }

    notes.push(`${source.tags.length} tags, ${byId.size} distinct questions in the window.`);
    if (capped.length) {
      notes.push(`Capped at ${SO_MAX_PAGES * PAGE_SIZE} newest questions per tag (more exist): ${capped.map((t) => `[${t}]`).join(", ")}.`);
    }
    if (failures.length) notes.push(`Incomplete: ${failures.length} requests failed: ${failures.slice(0, 5).join("; ")}.`);
    if (stopped) {
      const rest = notFetched.length ? `; tags not fetched: ${notFetched.map((t) => `[${t}]`).join(", ")}` : "";
      notes.push(`Stopped early: ${stopped} while fetching [${stoppedAt}]${rest}.`);
    }
    if (malformed) notes.push(`${malformed} questions skipped (unexpected shape).`);
    if (quota) notes.push(`API quota remaining: ${quota.remaining}${quota.max ? ` of ${quota.max}` : ""} for today.`);

    if (succeeded === 0) {
      return done(false, [], failures[0] ?? (stopped ? `Stack Overflow: ${stopped}` : "No Stack Overflow request succeeded."));
    }
    return done(true, [...byId.values()], null);
  } catch (err) {
    return done(false, [], `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
