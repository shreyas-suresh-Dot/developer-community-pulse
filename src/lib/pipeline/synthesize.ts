import "server-only";
import { ThinkingLevel } from "@google/genai";
import { z } from "zod";
import type { Analysis, PulseConfig, Quality, Stats, Week } from "../contracts";
import { AiError, generateJson, requestCount, type AiClient } from "./ai";
import { buildFallbackAnalysis, type FallbackReason } from "./fallback";
import { synthesisPrompt, synthesizeSystemPrompt, trendSummary, type SynthesisThread } from "./prompts";
import type { ThreadAgg, ThreadInsight } from "./types";
import { LAST_WEEK, LIMITS, prioritizeThreads, THIS_WEEK, validateAnalysis } from "./validate";

/*
 * Steps 7–8: one Gemini call turns this week's and last week's relevant threads into the written brief;
 * validateAnalysis then keeps only what the evidence supports and code computes every count. Never
 * throws: no insights, a quiet week, an AI failure or an exhausted time budget all fall back to the
 * deterministic brief, and the quality report says which path was taken and why.
 */

export const MAX_SYNTHESIS_THREADS = 140;
/** Fewer relevant threads than this this week → nothing worth clustering; the quiet-week brief is used. */
const MIN_RELEVANT_THIS_WEEK = 3;
/** A synthesis call needs real time; with less budget left the fallback is used straight away. */
const MIN_BUDGET_MS = 15_000;

export type SynthesizeInput = {
  config: PulseConfig;
  stats: Stats;
  weeks: Week[];
  threads: ReadonlyMap<string, ThreadAgg>;
  insights: ReadonlyMap<string, ThreadInsight>;
  deadline: number;
  thinking?: ThinkingLevel;
  client?: AiClient;
  models?: readonly string[];
};

export type SynthesizeResult = {
  analysis: Analysis;
  report: Quality["synthesis"];
  citations: Quality["citations"];
  caps: Quality["caps"];
};

function synthesisSchema(categorySlugs: readonly string[]) {
  const keys = (what: string) => z.array(z.string()).describe(what);
  const evidence = keys("Supporting thread keys, copied exactly from the input");
  // Property order is generation order: clusters and evidence first, the headline last, once the
  // model has worked through the threads. Length limits are hints; validateAnalysis enforces them.
  return z.object({
    painPoints: z
      .array(
        z.object({
          id: z.string().describe('"P1", "P2", … most important first'),
          category: z.string().meta({ enum: [...categorySlugs] }),
          thisWeek: keys('Keys of threads with week "this" or "both" that discuss this problem'),
          lastWeek: keys('Keys of threads with week "last" or "both" that discuss the same problem'),
          title: z.string().describe(`Specific problem name, at most ${LIMITS.title} characters`),
          summary: z.string().describe(`At most ${LIMITS.summary} characters, no numbers`),
          unresolved: z.boolean(),
          quote: z
            .object({
              key: z.string(),
              text: z.string().describe(`Copied verbatim from that thread's excerpt, at most ${LIMITS.quote} characters`),
            })
            .nullable(),
        }),
      )
      .meta({ maxItems: LIMITS.painPoints }),
    underserved: z
      .array(
        z.object({
          problem: z.string(),
          whyUnderserved: z.string(),
          toolsMentioned: z.array(z.string()).meta({ maxItems: LIMITS.tools }),
          opportunity: z.string(),
          threadKeys: evidence,
        }),
      )
      .meta({ maxItems: LIMITS.underserved }),
    objections: z
      .array(z.object({ objection: z.string(), context: z.string(), threadKeys: evidence }))
      .meta({ maxItems: LIMITS.objections }),
    sprintSuggestions: z
      .array(z.object({ suggestion: z.string(), rationale: z.string(), painPointIds: z.array(z.string()) }))
      .meta({ maxItems: LIMITS.sprintSuggestions }),
    watchlist: z.array(z.object({ signal: z.string(), threadKeys: evidence })).meta({ maxItems: LIMITS.watchlist }),
    caveats: z.array(z.string()).meta({ maxItems: LIMITS.caveats }),
    headline: z.string().describe(`One or two sentences, at most ${LIMITS.headline} characters, no numbers`),
  });
}

export async function synthesizeBrief(input: SynthesizeInput): Promise<SynthesizeResult> {
  const started = Date.now();
  const { config, stats, weeks, threads, insights, deadline } = input;

  const active = prioritizeThreads(threads.values());
  const relevant = active.filter((t) => insights.get(t.threadKey)?.relevant === true);
  const sent = relevant.slice(0, MAX_SYNTHESIS_THREADS);
  const caps: Quality["caps"] = [];
  if (relevant.length > sent.length) {
    caps.push({
      what: `Relevant threads sent to AI synthesis (max ${MAX_SYNTHESIS_THREADS})`,
      kept: sent.length,
      dropped: relevant.length - sent.length,
    });
  }

  const fallback = (reason: FallbackReason, error: string | null, attempts = 0): SynthesizeResult => ({
    analysis: buildFallbackAnalysis({ config, stats, weeks, threads, reason }),
    report: { ok: error === null, mode: "fallback", model: null, attempts, ms: Date.now() - started, error },
    citations: { cited: 0, valid: 0, dropped: 0 },
    caps,
  });

  if (!active.some((t) => insights.has(t.threadKey))) {
    return active.some((t) => t.mentionsByWeek[THIS_WEEK] > 0)
      ? fallback("ai_unavailable", "No AI classifications were available for this week's threads.")
      : fallback("quiet_week", null);
  }
  if (sent.filter((t) => t.mentionsByWeek[THIS_WEEK] > 0).length < MIN_RELEVANT_THIS_WEEK) {
    return fallback("quiet_week", null);
  }
  if (deadline - Date.now() < MIN_BUDGET_MS) {
    return fallback("ai_unavailable", "The time budget ran out before the AI summary could start.");
  }

  const promptThreads: SynthesisThread[] = sent.flatMap((thread) => {
    const insight = insights.get(thread.threadKey);
    return insight ? [{ thread, insight }] : [];
  });

  try {
    const result = await generateJson({
      label: "synthesize",
      schema: synthesisSchema(config.categories.map((c) => c.slug)),
      system: synthesizeSystemPrompt(config),
      prompt: synthesisPrompt({ weeks, trend: trendSummary(stats), threads: promptThreads }),
      maxOutputTokens: 16_384,
      deadline,
      perAttemptTimeoutMs: 90_000,
      thinking: input.thinking ?? ThinkingLevel.LOW,
      client: input.client,
      models: input.models,
    });
    const { analysis, citations } = validateAnalysis(result.data, {
      config,
      weeks,
      threads,
      allowedThisWeek: new Set(sent.filter((t) => t.mentionsByWeek[THIS_WEEK] > 0).map((t) => t.threadKey)),
      allowedLastWeek: new Set(sent.filter((t) => t.mentionsByWeek[LAST_WEEK] > 0).map((t) => t.threadKey)),
    });
    const attempts = requestCount(result.attempts);
    if (analysis.painPoints.length === 0 && result.data.painPoints.length > 0) {
      const discarded = fallback("ai_unavailable", "The AI summary cited no valid threads, so it was discarded.", attempts);
      return { ...discarded, citations };
    }
    return {
      analysis: {
        ...analysis,
        caveats: [...analysis.caveats, ...coverageCaveats(active, insights, caps)],
        mode: "ai",
        model: result.model,
      },
      report: { ok: true, mode: "ai", model: result.model, attempts, ms: Date.now() - started, error: null },
      citations,
      caps,
    };
  } catch (e) {
    const attempts = e instanceof AiError ? requestCount(e.attempts) : 0;
    return fallback("ai_unavailable", e instanceof Error ? e.message : String(e), attempts);
  }
}

/** Code-written caveats about what the AI did not see, so gaps are never silent. */
function coverageCaveats(
  active: readonly ThreadAgg[],
  insights: ReadonlyMap<string, ThreadInsight>,
  caps: Quality["caps"],
): string[] {
  const notes: string[] = [];
  const unchecked = active.filter((t) => !insights.has(t.threadKey)).length;
  if (unchecked > 0) {
    notes.push(
      `${unchecked} active thread${unchecked === 1 ? " was" : "s were"} not AI-checked this run and ${unchecked === 1 ? "is" : "are"} not part of the pain points.`,
    );
  }
  for (const cap of caps) {
    notes.push(`Only the ${cap.kept} most active relevant threads were analysed; ${cap.dropped} more were left out.`);
  }
  return notes;
}
