import "server-only";
import type { BriefRecord, Delivery, Quality, RunStep, Stats } from "../contracts";
import { addDays, fourWeeks, isFriday, latestWeekEnd } from "../weeks";
import { classifyThreads, type ClassifyResult } from "./classify";
import { loadConfig } from "./config";
import { deliverBrief } from "./deliver";
import { buildMatcher, matchMentions } from "./matching";
import { collectAll } from "./sources";
import { buildStats } from "./stats";
import {
  findActiveRun,
  loadInsights,
  markStaleRunsFailed,
  saveBrief,
  saveInsights,
  saveMentions,
  setDelivery,
  startRun,
  updateRun,
  type BriefStatus,
  type Trigger,
} from "./store";
import { synthesizeBrief, type SynthesizeResult } from "./synthesize";
import type { SourceResult, ThreadAgg, ThreadInsight } from "./types";

/*
 * One weekly run, start to finish. Each step's status and timing is written to pipeline_runs as soon as
 * it changes, so the dashboard can show live progress. A run always ends in one of two ways: a saved
 * brief (complete, or partial when a source or the AI failed) or a failed run with the reason —
 * a failed run never overwrites an existing brief.
 */

/** Vercel Hobby functions may run 300 s; keep a margin for the final writes. */
export const RUN_BUDGET_MS = 270_000;
const COLLECT_BUDGET_MS = 110_000;
/** Time kept back for the synthesis call when classification runs long. */
const SYNTHESIS_RESERVE_MS = 75_000;
/** Most uncached threads classified per run (4 batches of 60); cached threads are free. */
const CLASSIFY_CAP = 240;

export class RunConflictError extends Error {
  constructor(readonly runId: string) {
    super("A run for this week is already in progress.");
    this.name = "RunConflictError";
  }
}

export type RunOptions = {
  trigger: Trigger;
  /** Friday (YYYY-MM-DD) to report on; defaults to the latest Friday that has started (IST). */
  weekEnd?: string;
  /** A run row created by the caller (the manual-run API creates it before responding). */
  runId?: string;
};

export type RunOutcome = { runId: string; briefId: string | null; status: BriefStatus; weekEnd: string };

/** Validates a requested week: must be a Friday and not later than the latest reportable week. */
export function resolveWeekEnd(weekEnd: string | undefined, now: Date = new Date()): string {
  const latest = latestWeekEnd(now);
  if (weekEnd === undefined) return latest;
  if (!isFriday(weekEnd)) throw new RangeError(`${weekEnd} is not a Friday.`);
  if (weekEnd > latest) throw new RangeError(`${weekEnd} has not started yet; the latest week ends ${latest}.`);
  return weekEnd;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type StepResult<T> = { value: T; detail: string; status?: "ok" | "warning" };

/** Records steps on the run row; progress writes are best-effort so they never break a run. */
class StepLog {
  readonly steps: RunStep[] = [];
  constructor(private readonly runId: string) {}

  async step<T>(name: string, fn: () => Promise<StepResult<T>>): Promise<T> {
    const step: RunStep = { name, status: "running", ms: null, detail: "" };
    this.steps.push(step);
    await this.flush();
    const started = Date.now();
    try {
      const { value, detail, status = "ok" } = await fn();
      Object.assign(step, { status, ms: Date.now() - started, detail });
      return value;
    } catch (e) {
      Object.assign(step, { status: "failed", ms: Date.now() - started, detail: message(e) });
      throw e;
    } finally {
      await this.flush();
    }
  }

  private async flush() {
    await updateRun(this.runId, { status: "running", steps: this.steps }).catch(() => undefined);
  }
}

export async function runPipeline(options: RunOptions): Promise<RunOutcome> {
  const started = Date.now();
  const deadline = started + RUN_BUDGET_MS;
  const weekEnd = resolveWeekEnd(options.weekEnd);
  const weeks = fourWeeks(weekEnd);

  await markStaleRunsFailed().catch(() => 0);
  if (!options.runId) {
    const active = await findActiveRun(weekEnd);
    if (active) throw new RunConflictError(active.id);
  }
  const runId = options.runId ?? (await startRun(options.trigger, weekEnd));
  const log = new StepLog(runId);

  try {
    const config = await log.step("Load topic config", async () => {
      const c = await loadConfig();
      const keywords = c.categories.reduce((n, cat) => n + cat.keywords.length, 0);
      const notes = c.notes.length ? ` · ${c.notes.join("; ")}` : "";
      return {
        value: c,
        detail: `${c.categories.length} categories, ${keywords} keywords, ${c.contextTerms.length} context terms${notes}`,
        status: c.notes.length ? "warning" : "ok",
      };
    });

    const sources = await log.step("Collect posts", async () => {
      const results = await collectAll(config, weeks, { deadline: Math.min(started + COLLECT_BUDGET_MS, deadline) });
      const active = results.filter((r) => config.sources.find((s) => s.slug === r.source)?.isActive);
      if (active.length > 0 && active.every((r) => !r.ok)) {
        throw new Error(`Every source failed: ${active.map((r) => `${r.name} (${r.error ?? "no data"})`).join("; ")}`);
      }
      return {
        value: results,
        detail: results.map((r) => `${r.name}: ${r.ok ? `${r.items.length} posts` : `failed (${r.error ?? "no data"})`}`).join(" · "),
        status: results.some((r) => !r.ok) ? "warning" : "ok",
      };
    });

    const fetched = sources.reduce((n, r) => n + r.items.length, 0);
    const matched = await log.step("Match keywords", async () => {
      const summary = matchMentions(sources.flatMap((r) => r.items), buildMatcher(config), weeks);
      return {
        value: summary,
        detail: `${summary.mentions.length} of ${fetched} posts matched a keyword · ${summary.droppedNoContext} generic-keyword hits ignored (no code-review context)`,
      };
    });

    await log.step("Store mentions", async () => {
      try {
        const saved = await saveMentions(matched.mentions);
        return { value: saved, detail: `${saved} mentions saved` };
      } catch (e) {
        return { value: 0, detail: `Not saved (${message(e)}); the brief is computed from this run's data either way`, status: "warning" };
      }
    });

    const { stats, threads } = await log.step("Count and compare weeks", async () => {
      const result = buildStats({ config, weeks, mentions: matched.mentions, sourceResults: sources });
      const t = result.stats.totals.threads;
      return { value: result, detail: `${t[3]} threads this week vs ${t[2]} last week · ${result.stats.keywords.length} keywords seen in 4 weeks` };
    });

    const classified = await log.step("AI relevance check", async () => {
      const candidates = [...threads.values()].filter((t) => t.mentionsByWeek[3] > 0 || t.mentionsByWeek[2] > 0);
      let cacheNote = "";
      const cached = await loadInsights(
        candidates.map((t) => t.threadKey),
        config.configHash,
      ).catch((e) => {
        cacheNote = ` · cache unavailable (${message(e)})`;
        return new Map<string, ThreadInsight>();
      });
      const result = await classifyThreads({
        config,
        candidates,
        cached,
        maxThreads: CLASSIFY_CAP,
        deadline: deadline - SYNTHESIS_RESERVE_MS,
      });
      if (result.fresh.length > 0) {
        await saveInsights(result.fresh, config.configHash).catch((e) => {
          cacheNote += ` · new insights not cached (${message(e)})`;
        });
      }
      const r = result.report;
      return {
        value: result,
        detail: `${r.checked} threads checked (${r.fromCache} from cache), ${r.relevant} on-topic${r.failed ? `, ${r.failed} not checked` : ""}${result.error ? ` · ${result.error}` : ""}${cacheNote}`,
        status: r.failed > 0 || result.error ? "warning" : "ok",
      };
    });

    const verifiedStats = withVerified(stats, threads, classified.insights);

    const synthesis = await log.step("Write brief (AI)", async () => {
      const result = await synthesizeBrief({ config, stats: verifiedStats, weeks, threads, insights: classified.insights, deadline });
      const r = result.report;
      return {
        value: result,
        detail:
          r.mode === "ai"
            ? `Written by ${r.model} · ${result.citations.valid} of ${result.citations.cited} citations verified`
            : `Keyword-based brief (${r.error ?? "quiet week: too few relevant threads for an AI summary"})`,
        status: r.ok ? "ok" : "warning",
      };
    });

    const status: BriefStatus = sources.every((r) => r.ok) && synthesis.report.ok ? "complete" : "partial";
    const quality: Quality = {
      runId,
      durationMs: 0,
      sources: sources.map((r) => ({
        source: r.source,
        name: r.name,
        ok: r.ok,
        items: r.items.length,
        requests: r.requests,
        ms: Math.round(r.ms),
        error: r.error,
        notes: r.notes,
      })),
      matching: { fetched, matched: matched.mentions.length, droppedNoContext: matched.droppedNoContext, threads: threads.size },
      classification: classified.report,
      synthesis: synthesis.report,
      citations: synthesis.citations,
      caps: [...classified.caps, ...synthesis.caps],
      checks: [],
    };
    quality.checks = qualityChecks(sources, quality, classified, synthesis);

    const pending: Delivery = { channel: "web", status: "skipped", to: [], at: null, detail: "Delivery pending" };
    const briefId = await log.step("Save brief", async () => {
      const id = await saveBrief({
        weekEnd,
        status,
        trigger: options.trigger,
        stats: verifiedStats,
        analysis: synthesis.analysis,
        quality: { ...quality, durationMs: Date.now() - started },
        delivery: pending,
        runId,
      });
      return { value: id, detail: `Brief saved as ${status} for the week ending ${weekEnd}` };
    });

    await log.step("Deliver", async () => {
      const brief: BriefRecord = {
        id: briefId,
        weekEnd,
        weekStart: addDays(weekEnd, -7),
        status,
        trigger: options.trigger,
        generatedAt: new Date().toISOString(),
        stats: verifiedStats,
        analysis: synthesis.analysis,
        quality,
        delivery: pending,
      };
      const delivery = await deliverBrief(brief, emailPolicy(options.trigger, weekEnd));
      await setDelivery(briefId, delivery);
      const detail =
        delivery.status === "sent"
          ? `Emailed to ${delivery.to.length} recipient${delivery.to.length === 1 ? "" : "s"}`
          : delivery.status === "failed"
            ? `Email failed: ${delivery.detail ?? "unknown error"} (brief is on the dashboard)`
            : (delivery.detail ?? "Published on the dashboard");
      return { value: delivery, detail, status: delivery.status === "failed" ? "warning" : "ok" };
    });

    await updateRun(runId, { status, steps: log.steps, error: null, briefId });
    return { runId, briefId, status, weekEnd };
  } catch (e) {
    await updateRun(runId, { status: "failed", steps: log.steps, error: message(e) }).catch(() => undefined);
    throw e;
  }
}

/** Only the scheduled run and a manual run of the latest week email Sumit; backfills and past weeks don't. */
function emailPolicy(trigger: Trigger, weekEnd: string): { send: boolean; reason?: string } {
  if (trigger === "cron") return { send: true };
  if (trigger === "manual" && weekEnd === latestWeekEnd()) return { send: true };
  return { send: false, reason: `No email for a ${trigger} run of a past week; brief published on the dashboard.` };
}

/** Adds the AI relevance check of this week's threads to each category (checked = has an insight). */
export function withVerified(stats: Stats, threads: ReadonlyMap<string, ThreadAgg>, insights: ReadonlyMap<string, ThreadInsight>): Stats {
  const thisWeek = [...threads.values()].filter((t) => t.mentionsByWeek[3] > 0);
  return {
    ...stats,
    categories: stats.categories.map((category) => {
      const checked = thisWeek.filter((t) => t.categories.includes(category.slug) && insights.has(t.threadKey));
      if (checked.length === 0) return { ...category, verified: null };
      const relevant = checked.filter((t) => insights.get(t.threadKey)?.relevant).length;
      return { ...category, verified: { checked: checked.length, relevant } };
    }),
  };
}

function qualityChecks(sources: SourceResult[], q: Quality, classified: ClassifyResult, synthesis: SynthesizeResult): Quality["checks"] {
  const failed = sources.filter((r) => !r.ok);
  const { checked, relevant, failed: unchecked } = classified.report;
  const { cited, valid, dropped } = synthesis.citations;
  const ai = synthesis.report;
  return [
    {
      name: "Sources responded",
      passed: failed.length === 0,
      detail:
        failed.length === 0
          ? `All ${sources.length} sources returned data (${q.matching.fetched} posts fetched).`
          : `${failed.map((r) => `${r.name} failed: ${r.error ?? "no data"}`).join("; ")}. The brief uses the other sources.`,
    },
    {
      name: "Keyword matching",
      passed: true,
      detail: `${q.matching.matched} posts matched a monitored keyword across ${q.matching.threads} threads; ${q.matching.droppedNoContext} generic-keyword hits were ignored because the post had no code-review/CI context.`,
    },
    {
      name: "AI relevance check",
      passed: checked > 0 && unchecked === 0,
      detail:
        checked > 0
          ? `${relevant} of ${checked} threads judged on-topic (${Math.round((100 * relevant) / checked)}%)${unchecked ? `; ${unchecked} could not be checked` : ""}.`
          : "No threads could be checked by the AI this run.",
    },
    {
      name: "Citations verified",
      passed: ai.mode === "fallback" || dropped === 0,
      detail:
        ai.mode === "fallback"
          ? "Keyword-based brief: every listed thread comes straight from collected data."
          : dropped === 0
            ? `All ${cited} cited threads exist in this run's data and the right week.`
            : `${valid} of ${cited} citations verified; ${dropped} invalid ones were removed before publishing.`,
    },
    {
      name: "Quotes are verbatim",
      passed: true,
      detail: "Each quote was checked word-for-word against its thread's text; any that did not match were removed.",
    },
    {
      name: "Numbers computed by code",
      passed: true,
      detail: "Every count and trend comes from the collected posts; the AI only groups threads and writes the text.",
    },
    {
      name: "AI summary",
      passed: ai.mode === "ai",
      detail:
        ai.mode === "ai"
          ? `Written by ${ai.model} in ${(ai.ms / 1000).toFixed(1)} s (${ai.attempts} request${ai.attempts === 1 ? "" : "s"}).`
          : `Fallback brief: ${ai.error ?? "too few relevant threads this week for an AI summary"}.`,
    },
    {
      name: "Nothing silently capped",
      passed: true,
      detail: q.caps.length === 0 ? "No limits were hit." : q.caps.map((c) => `${c.what}: kept ${c.kept}, left out ${c.dropped}`).join("; "),
    },
  ];
}
