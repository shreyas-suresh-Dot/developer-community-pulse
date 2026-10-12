import { describe, expect, it } from "vitest";
import { BriefRecordSchema, RunRecordSchema } from "@/lib/contracts";
import { sampleBrief, sampleBriefSummaries, sampleFallbackBrief, sampleRuns } from "./sample-brief";
import { sampleTopicConfig } from "./sample-topics";

describe("sample fixtures", () => {
  it("is a valid BriefRecord", () => {
    const parsed = BriefRecordSchema.safeParse(sampleBrief);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
  });

  it("includes a valid fallback-mode brief whose evidence falls in its own week", () => {
    const parsed = BriefRecordSchema.safeParse(sampleFallbackBrief);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
    const analysis = sampleFallbackBrief.analysis;
    if (!analysis) throw new Error("fallback fixture must include an analysis");
    expect(analysis.mode).toBe("fallback");
    expect(analysis.objections).toEqual([]);
    expect(analysis.sprintSuggestions).toEqual([]);
    const week = sampleFallbackBrief.stats.weeks[3];
    for (const thread of Object.values(analysis.evidence)) {
      const t = Date.parse(thread.postedAt);
      expect(t >= Date.parse(week.start) && t < Date.parse(week.end), thread.threadKey).toBe(true);
    }
  });

  it("has valid RunRecords", () => {
    for (const run of sampleRuns) {
      const parsed = RunRecordSchema.safeParse(run);
      expect(parsed.success, `${run.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))}`).toBe(true);
    }
  });

  it("follows the pipeline's citation rules: every cited key has evidence from the right week", () => {
    const analysis = sampleBrief.analysis;
    if (!analysis) throw new Error("fixture must include an analysis");
    const [thisWeek, lastWeek] = [sampleBrief.stats.weeks[3], sampleBrief.stats.weeks[2]];
    const inWeek = (key: string, week: typeof thisWeek) => {
      const t = Date.parse(analysis.evidence[key]?.postedAt ?? "");
      return t >= Date.parse(week.start) && t < Date.parse(week.end);
    };
    for (const p of analysis.painPoints) {
      for (const key of p.thisWeek) expect(inWeek(key, thisWeek), `${key} in this week`).toBe(true);
      for (const key of p.lastWeek) expect(inWeek(key, lastWeek), `${key} in last week`).toBe(true);
      expect(p.change.current).toBe(p.thisWeek.length);
      expect(p.change.previous).toBe(p.lastWeek.length);
      if (p.quote) expect(analysis.evidence[p.quote.threadKey]?.excerpt).toContain(p.quote.text);
    }
    const cited = [
      ...analysis.underserved.flatMap((u) => u.threadKeys),
      ...analysis.objections.flatMap((o) => o.threadKeys),
      ...analysis.watchlist.flatMap((w) => w.threadKeys),
    ];
    for (const key of cited) expect(analysis.evidence[key], key).toBeDefined();
  });

  it("keeps the stats internally consistent", () => {
    const { totals, sources, categories, keywords } = sampleBrief.stats;
    for (let week = 0; week < 4; week++) {
      expect(sources.reduce((sum, s) => sum + s.mentions[week], 0)).toBe(totals.mentions[week]);
      expect(sources.reduce((sum, s) => sum + s.threads[week], 0)).toBe(totals.threads[week]);
    }
    const byThisWeek = (values: number[]) => values.every((v, i) => i === 0 || values[i - 1] >= v);
    expect(byThisWeek(categories.map((c) => c.threads[3]))).toBe(true);
    expect(byThisWeek(keywords.map((k) => k.mentions[3]))).toBe(true);
    expect(keywords.find((k) => k.keyword === "false positive rate")?.change).toMatchObject({ current: 14, previous: 4, trend: "rising" });
  });

  it("summarises the archive newest first and mirrors the seeded topic config", () => {
    expect(sampleBriefSummaries.map((s) => s.weekEnd)).toEqual(["2026-10-09", "2026-10-02", "2026-09-25"]);
    expect(sampleTopicConfig.categories).toHaveLength(7);
    expect(sampleTopicConfig.categories.flatMap((c) => c.keywords)).toHaveLength(50);
    expect(sampleTopicConfig.contextTerms).toHaveLength(22);
  });
});
