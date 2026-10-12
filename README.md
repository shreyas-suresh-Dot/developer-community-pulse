# Developer Community Pulse

**An AI-powered weekly developer-community intelligence digest for Sumit**, the sole PM at a 15-person startup that
sells a code-review automation tool to mid-size engineering teams. Every **Friday at 07:00 IST** it reads what
developers posted on **Hacker News, Stack Overflow and DEV** about code review, CI/CD and developer workflow, and
delivers a brief that answers four questions:

1. What are developers actively discussing in our problem space right now?
2. Which pain points surface most often?
3. Is each one trending up or down compared with last week (and over the last month)?
4. Which problems look unresolved or underserved by existing tools?

- **Live app:** https://developer-community-pulse-nine.vercel.app
- **Design doc (scope, pipeline, edge cases):** [docs/DESIGN.md](docs/DESIGN.md)

---

## What Sumit gets

| Need from the brief | How the app answers it |
|---|---|
| "What are developers discussing right now?" | Matched threads from 3 communities for the last 7 days (Fri→Fri, IST), with links to every thread. |
| "Which pain points are most frequent?" | Gemini groups this week's on-topic threads into pain points; **code counts** how many threads each one has. |
| "Trending up or down vs last week?" | Every pain point, topic category and keyword shows this week vs last week and a trend label (new / rising / steady / falling / quiet) from fixed rules. Keywords and categories carry a 4-week sparkline, so "is *false positive rate* 4 mentions or 14, and has it grown for a month?" is answered directly. |
| "Which problems are unresolved / underserved?" | AI flags threads asking for help, complaining about tools, or describing workarounds; plus Stack Overflow questions still without an accepted answer. |
| Sales objections & sprint planning | "Objections your sales team may hear" and "For Monday's sprint planning", each linked to the pain points and threads behind it. |
| Change topics without code | Categories, keywords, context terms and sources live in **Supabase** tables; the next run picks up any edit. |
| Arrives before the afternoon sync | Vercel Cron, Friday 01:30 UTC = **07:00 IST**, email via Resend + the web dashboard. |

## How it works

```
Vercel Cron (Fri 07:00 IST) ─┐        ┌── "Run now" (passcode) on /how-it-works
                             ▼        ▼
1 Load config ......... Supabase: topic_categories, topic_keywords, context_terms, community_sources
2 Collect ............. Hacker News (Algolia API) · Stack Overflow (Stack Exchange API) · DEV (Forem API)   — 4 weeks, in parallel
3 Match ............... keyword regex + "context terms" for generic keywords (code)
4 Store ............... mentions → Supabase (token-gated write function)
5 Count ............... per-week mentions/threads per keyword, category, source; week-over-week trends (code)
6 Classify (AI) ....... Gemini: on-topic? category, pain point, unresolved signal, tools — cached per thread
7 Synthesize (AI) ..... Gemini: pain-point clusters for this + last week, underserved, objections, suggestions
8 Validate ............ drop invented/wrong-week thread keys, verify quotes verbatim, compute counts/trends (code)
9 Save ................ briefs (one per week, idempotent upsert) + run log with per-step timings
10 Deliver ............ email (Resend) + dashboard
```

**Design principle: numbers come from code, words come from the AI.** The model never outputs a count; it only
groups thread keys, and code counts them after checking every key exists in this run's data. Quotes must appear
word-for-word in the source text. Each brief ends with a "How this brief was made" checklist (sources,
matching, AI relevance, citations, caps).

### Results from real runs (October 2026)

| Week ending | Posts fetched | Matched a keyword | Threads (this vs last week) | AI relevance check | Citations verified | Written by | Run time |
|---|---|---|---|---|---|---|---|
| Fri 9 Oct 2026 | 5,548 | 2,244 | 334 vs 345 | 436 on-topic of 507 checked (267 from cache) | 99 of 99 | `gemini-3.6-flash` | 124 s |
| Fri 2 Oct 2026 | 4,404 | 2,022 | 315 vs 346 | 217 on-topic of 244 checked | 68 of 70 (2 removed) | `gemini-3-flash-preview` (fallback) | 219 s |

About 1,400 generic-keyword hits per run were ignored because the post had no code-review context. Both runs
finished within Vercel's 300 s function limit, and the 9 Oct brief was emailed. Every run's step log is on
[/how-it-works](https://developer-community-pulse-nine.vercel.app/how-it-works).

### Reliability
- **Model fallback chain:** `gemini-3.6-flash` → `gemini-3-flash-preview` → `gemini-3.5-flash-lite`, with a time limit per attempt and for the whole run. A 429 or 503 moves to the next model at once; a 4xx config error fails fast.
- **Structured output:** JSON Schema generated from zod; every reply is validated before use.
- **Graceful degradation:** if a source fails, the brief is marked *partial* and names it. If the AI is unavailable, a keyword-based brief is still delivered.
- **Prompt-injection safe:** community text is wrapped as untrusted data, output is schema-constrained, and citations are validated.
- **Idempotent and observable:** one brief per week (re-runs replace it), duplicate-run guard, stale-run cleanup, and every step logged for the run page.

### Security
- Supabase **row-level security**: the public (publishable) key can only *read*. All writes go through `SECURITY DEFINER` functions that require a server-held token; only its SHA-256 is stored in the database.
- The cron endpoint requires `Authorization: Bearer $CRON_SECRET`, sent by Vercel. Manual runs need a passcode and have a 2-minute cooldown. Secrets are compared in constant time.
- All Supabase and Gemini calls run server-side; no secret reaches the browser.

## Tech stack
Next.js 16 (App Router, TypeScript, Tailwind v4) on **Vercel** · **Supabase** (Postgres + RLS) · **Gemini** via
`@google/genai` · **Resend** for email · zod · vitest.

```
src/lib/contracts.ts        stored shapes (stats / analysis / quality / delivery) shared by pipeline and UI
src/lib/pipeline/           config · sources/ · matching · stats · trend · ai · classify · synthesize · validate · fallback · store · deliver · run
src/app/api/                cron/weekly-brief · pipeline/run · runs/[id]
src/app/                    / (latest brief) · /briefs · /briefs/[weekEnd] · /topics · /how-it-works
supabase/migrations/        schema, RLS, write functions, seed topics
```

## Run it locally
```bash
npm install
# .env.local (never commit):
# GEMINI_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PIPELINE_DB_TOKEN, CRON_SECRET, ADMIN_PASSCODE
# optional: RESEND_API_KEY, BRIEF_RECIPIENTS (comma-separated), BRIEF_FROM, STACKEXCHANGE_KEY, GEMINI_MODELS
npm run dev                                                # http://localhost:3000
PULSE_FIXTURE=1 npm run dev                                # the UI with sample data, no database needed
npm run pipeline -- --week 2026-10-09 --trigger backfill   # run the weekly pipeline for one week
npm test                                                   # 91 unit tests (matching, weeks, trends, stats, validation, fallback, AI error handling)
```
New Supabase project: apply `supabase/migrations/*.sql`, then insert the SHA-256 of `PIPELINE_DB_TOKEN` into
`private.app_secrets` (see the comment in `001_schema.sql`).

## Scope decisions
- **Sources:** Hacker News, Stack Overflow and DEV have free, ToS-friendly public APIs. **Reddit is excluded**: it returns HTTP 403 to server requests and new API apps need approval. X and Discord need paid or privileged access. Each source is an adapter, so adding one doesn't touch the rest of the pipeline.
- **Free tiers:** Gemini's free tier allows 5 requests/min per model, so the pipeline makes a few large, cached calls. The 3-model chain spreads the load.
- **Known limitations:** keyword recall depends on Sumit's keyword list; AI relevance is a judgement shown alongside the counts, never instead of them. `npm audit` reports 5 high advisories in the **dev-only** ESLint toolchain (`eslint-config-next` → `micromatch`/`braces`). They are not part of the production bundle, and npm's suggested fix is a downgrade to Next 14's lint config.
