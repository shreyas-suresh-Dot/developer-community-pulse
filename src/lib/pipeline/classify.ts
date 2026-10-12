import "server-only";
import { z } from "zod";
import type { PulseConfig, Quality } from "../contracts";
import { AiError, generateJson, type AiClient } from "./ai";
import { classifyPrompt, classifySystemPrompt } from "./prompts";
import { UNRESOLVED_SIGNALS, type ThreadAgg, type ThreadInsight, type UnresolvedSignal } from "./types";
import { clip, prioritizeThreads, uniqueStrings } from "./validate";

/*
 * Step 6: Gemini reads each candidate thread once — relevant? which category? what pain? unresolved? —
 * so keyword noise ("false positive" in a medical thread) is filtered before anything is summarised.
 * The caller caches results per thread + configHash, so only new threads cost a request. Batches run
 * one after another (free tier: 5 requests/minute per model) and the step never throws: threads that
 * could not be classified are counted as failed and the brief carries on without them.
 */

export type ClassifyInput = {
  config: PulseConfig;
  /** Threads from stats; only those active this week or last week are considered. */
  candidates: readonly ThreadAgg[];
  /** Insights already stored for the current configHash. */
  cached: ReadonlyMap<string, ThreadInsight>;
  deadline: number;
  /** Most uncached threads sent to the AI in one run, highest priority first. */
  maxThreads?: number;
  batchSize?: number;
  client?: AiClient;
  models?: readonly string[];
};

export type FreshInsight = { threadKey: string; insight: ThreadInsight; model: string };

export type ClassifyResult = {
  /** Cached + fresh insights for the candidate threads. */
  insights: Map<string, ThreadInsight>;
  /** New insights, for the caller to cache (pipeline_upsert_insights). */
  fresh: FreshInsight[];
  report: Quality["classification"];
  caps: Quality["caps"];
  /** Last AI failure message, for the run log; null when every batch succeeded. */
  error: string | null;
};

const PAIN_POINT_CHARS = 140;
const TOOL_CHARS = 40;
const MAX_TOOLS = 5;

function batchSchema(keys: readonly string[], categorySlugs: readonly string[]) {
  // Enums are JSON Schema hints that constrain decoding; parsing stays lenient so one odd value cannot
  // sink a whole batch, and normaliseInsight() maps anything unexpected to a safe default.
  return z.object({
    items: z.array(
      z.object({
        key: z.string().meta({ enum: [...keys] }),
        relevant: z.boolean(),
        category: z.string().meta({ enum: [...categorySlugs, "other"] }),
        isPain: z.boolean(),
        painPoint: z.string().describe('The concrete problem in at most 15 words; "" when isPain is false.'),
        unresolved: z.string().meta({ enum: [...UNRESOLVED_SIGNALS] }),
        tools: z.array(z.string()).meta({ maxItems: MAX_TOOLS }),
      }),
    ),
  });
}

type BatchItem = z.infer<ReturnType<typeof batchSchema>>["items"][number];

function isUnresolvedSignal(value: string): value is UnresolvedSignal {
  return (UNRESOLVED_SIGNALS as readonly string[]).includes(value);
}

export function normaliseInsight(item: BatchItem, categorySlugs: ReadonlySet<string>): ThreadInsight {
  const category = item.category.trim().toLowerCase();
  const unresolved = item.unresolved.trim().toLowerCase();
  return {
    relevant: item.relevant,
    category: categorySlugs.has(category) ? category : "other",
    isPain: item.isPain,
    painPoint: item.isPain ? clip(item.painPoint, PAIN_POINT_CHARS) : "",
    unresolved: isUnresolvedSignal(unresolved) ? unresolved : "none",
    tools: uniqueStrings(item.tools, MAX_TOOLS, TOOL_CHARS),
  };
}

export async function classifyThreads(input: ClassifyInput): Promise<ClassifyResult> {
  const { config, cached, deadline } = input;
  const maxThreads = Math.max(0, input.maxThreads ?? 150);
  const batchSize = Math.max(1, input.batchSize ?? 60);
  const retryBatchSize = Math.max(1, Math.ceil(batchSize / 3));
  const slugs = config.categories.map((c) => c.slug);
  const slugSet = new Set(slugs);
  const system = classifySystemPrompt(config);

  const ordered = prioritizeThreads(input.candidates);
  const insights = new Map<string, ThreadInsight>();
  for (const thread of ordered) {
    const hit = cached.get(thread.threadKey);
    if (hit) insights.set(thread.threadKey, hit);
  }
  const fromCache = insights.size;
  const uncached = ordered.filter((t) => !insights.has(t.threadKey));
  const toSend = uncached.slice(0, maxThreads);
  const caps: Quality["caps"] = [];
  if (uncached.length > toSend.length) {
    caps.push({
      what: `Threads sent to AI classification (max ${maxThreads})`,
      kept: toSend.length,
      dropped: uncached.length - toSend.length,
    });
  }

  const fresh: FreshInsight[] = [];
  const models: string[] = [];
  const state: { answered: boolean; stopped: boolean; error: string | null } = {
    answered: false,
    stopped: false,
    error: null,
  };

  /** Classifies `threads` in chunks of `size`; returns the threads that got no valid item. */
  const runBatches = async (threads: readonly ThreadAgg[], size: number, label: string): Promise<ThreadAgg[]> => {
    const missing: ThreadAgg[] = [];
    const total = Math.ceil(threads.length / size);
    for (let i = 0; i < threads.length; i += size) {
      const chunk = threads.slice(i, i + size);
      if (state.stopped) {
        missing.push(...chunk);
        continue;
      }
      const keys = chunk.map((t) => t.threadKey);
      try {
        const result = await generateJson({
          label: `${label} ${i / size + 1}/${total}`,
          schema: batchSchema(keys, slugs),
          system,
          prompt: classifyPrompt(chunk),
          maxOutputTokens: Math.min(16_000, 1_000 + chunk.length * 150),
          deadline,
          client: input.client,
          models: input.models,
        });
        state.answered = true;
        const wanted = new Set(keys);
        const got = new Set<string>();
        for (const item of result.data.items) {
          const key = item.key.trim();
          if (!wanted.has(key) || got.has(key)) continue;
          got.add(key);
          const insight = normaliseInsight(item, slugSet);
          insights.set(key, insight);
          fresh.push({ threadKey: key, insight, model: result.model });
        }
        if (got.size > 0 && !models.includes(result.model)) models.push(result.model);
        missing.push(...chunk.filter((t) => !got.has(t.threadKey)));
      } catch (e) {
        missing.push(...chunk);
        state.error = e instanceof Error ? e.message : String(e);
        if (e instanceof AiError && (e.code === "blocked" || e.code === "invalid")) state.answered = true;
        // A config error or an exhausted budget will not improve on the next batch.
        if (!(e instanceof AiError) || e.code === "config" || e.code === "deadline") state.stopped = true;
      }
    }
    return missing;
  };

  const missing = await runBatches(toSend, batchSize, "classify");
  // One retry in smaller batches, but only once the AI has shown it can answer in this run.
  const retry = missing.length > 0 && state.answered && !state.stopped;
  const failed = retry ? await runBatches(missing, retryBatchSize, "classify retry") : missing;

  let relevant = 0;
  for (const insight of insights.values()) if (insight.relevant) relevant += 1;

  return {
    insights,
    fresh,
    report: {
      candidates: ordered.length,
      checked: insights.size,
      fromCache,
      relevant,
      failed: failed.length,
      models,
    },
    caps,
    error: state.error,
  };
}
