import { describe, expect, it } from "vitest";
import { AnalysisSchema } from "../contracts";
import { testConfig } from "./__fixtures__/config";
import { fixtureThreads, makeThread, T, threadMap, weeks } from "./__fixtures__/threads";
import { change } from "./trend";
import {
  clip,
  isVerbatimQuote,
  prioritizeThreads,
  toThreadRef,
  uniqueStrings,
  validateAnalysis,
  type RawAnalysis,
  type RawPainPoint,
  type ValidationContext,
} from "./validate";

const ctx: ValidationContext = {
  config: testConfig,
  weeks,
  threads: threadMap(),
  // This week: 1001, 1002 (also last week), 2001, 3001, 1004. Last week: 1002, 1003, 2002. Never: devto:3002.
  allowedThisWeek: new Set(fixtureThreads.filter((t) => t.mentionsByWeek[3] > 0).map((t) => t.threadKey)),
  allowedLastWeek: new Set(fixtureThreads.filter((t) => t.mentionsByWeek[2] > 0).map((t) => t.threadKey)),
};

function raw(overrides: Partial<RawAnalysis> = {}): RawAnalysis {
  return {
    headline: "Developers are losing trust in noisy review bots.",
    painPoints: [],
    underserved: [],
    objections: [],
    sprintSuggestions: [],
    watchlist: [],
    caveats: [],
    ...overrides,
  };
}

function pain(overrides: Partial<RawPainPoint> = {}): RawPainPoint {
  return {
    id: "P1",
    title: "Review bots bury real bugs in nitpicks",
    category: "review-noise",
    summary: "Teams stop reading automated review comments.",
    thisWeek: [],
    lastWeek: [],
    unresolved: true,
    quote: null,
    ...overrides,
  };
}

const K = {
  nitpicks: T.aiNitpicks.threadKey, // this week
  noisyBot: T.noisyBot.threadKey, // both weeks
  statusCheck: T.statusCheck.threadKey, // this week
  queue: T.reviewQueue.threadKey, // this week
  noisyLast: T.noisyLastWeek.threadKey, // last week
  dupPipelines: T.duplicatePipelines.threadKey, // last week
  old: T.oldThread.threadKey, // outside both weeks
  noReview: T.noReview.threadKey, // this week
};

describe("validateAnalysis: thread keys", () => {
  it("keeps real keys, drops hallucinated ones and counts the citations", () => {
    const { analysis, citations } = validateAnalysis(
      raw({
        painPoints: [
          pain({
            thisWeek: [K.nitpicks, "hackernews:99999999", K.noisyBot],
            lastWeek: [K.noisyLast, "reddit:abc"],
          }),
        ],
      }),
      ctx,
    );
    expect(analysis.painPoints).toHaveLength(1);
    expect(analysis.painPoints[0].thisWeek).toEqual([K.nitpicks, K.noisyBot]);
    expect(analysis.painPoints[0].lastWeek).toEqual([K.noisyLast]);
    expect(citations).toEqual({ cited: 5, valid: 3, dropped: 2 });
    expect(Object.keys(analysis.evidence).sort()).toEqual([K.nitpicks, K.noisyBot, K.noisyLast].sort());
  });

  it("drops keys cited in the wrong week, and keys from older weeks", () => {
    const { analysis, citations } = validateAnalysis(
      raw({
        painPoints: [
          pain({
            thisWeek: [K.noisyLast, K.dupPipelines, K.old, K.statusCheck],
            lastWeek: [K.nitpicks, K.noisyBot, K.old],
          }),
        ],
      }),
      ctx,
    );
    const [p] = analysis.painPoints;
    expect(p.thisWeek).toEqual([K.statusCheck]);
    // A thread active in both weeks may be cited for last week too.
    expect(p.lastWeek).toEqual([K.noisyBot]);
    expect(citations).toEqual({ cited: 7, valid: 2, dropped: 5 });
  });

  it("counts a thread in at most one pain point per week: the first one in the model's order wins", () => {
    const { analysis } = validateAnalysis(
      raw({
        painPoints: [
          pain({ id: "P1", thisWeek: [K.nitpicks, K.noisyBot] }),
          pain({ id: "P2", title: "Slow reviews", category: "review-speed", thisWeek: [K.noisyBot, K.queue], lastWeek: [K.noisyBot] }),
        ],
      }),
      ctx,
    );
    const byId = Object.fromEntries(analysis.painPoints.map((p) => [p.id, p]));
    expect(byId.P1.thisWeek).toEqual([K.nitpicks, K.noisyBot]);
    expect(byId.P2.thisWeek).toEqual([K.queue]);
    // Last week's list is a separate week, so P2 can still claim the thread there.
    expect(byId.P2.lastWeek).toEqual([K.noisyBot]);
  });

  it("drops pain points left without evidence in either week", () => {
    const { analysis, citations } = validateAnalysis(
      raw({
        painPoints: [
          pain({ id: "P1", thisWeek: [K.nitpicks] }),
          pain({ id: "P2", thisWeek: ["hackernews:1"], lastWeek: [K.old] }),
          pain({ id: "P3", thisWeek: [], lastWeek: [] }),
        ],
      }),
      ctx,
    );
    expect(analysis.painPoints.map((p) => p.id)).toEqual(["P1"]);
    expect(citations).toEqual({ cited: 3, valid: 1, dropped: 2 });
  });

  it("de-duplicates a key repeated within one list", () => {
    const { analysis, citations } = validateAnalysis(
      raw({ painPoints: [pain({ thisWeek: [K.nitpicks, ` ${K.nitpicks} `, K.nitpicks] })] }),
      ctx,
    );
    expect(analysis.painPoints[0].thisWeek).toEqual([K.nitpicks]);
    expect(citations).toEqual({ cited: 3, valid: 1, dropped: 2 });
  });
});

describe("validateAnalysis: counts, trends and order come from code", () => {
  it("computes change from the surviving keys and sorts by this week's count, then by change", () => {
    const { analysis } = validateAnalysis(
      raw({
        painPoints: [
          pain({ id: "P1", category: "review-speed", thisWeek: [K.queue], lastWeek: [K.noisyLast, K.dupPipelines] }),
          pain({ id: "P2", thisWeek: [K.nitpicks, K.noisyBot, "hackernews:404"] }),
          pain({ id: "P3", category: "ci-cd", thisWeek: [K.statusCheck] }),
        ],
      }),
      ctx,
    );
    expect(analysis.painPoints.map((p) => p.id)).toEqual(["P2", "P3", "P1"]);
    expect(analysis.painPoints.map((p) => p.change)).toEqual([change(2, 0), change(1, 0), change(1, 2)]);
  });

  it("keeps at most 8 pain points, the largest ones", () => {
    const keys = [K.nitpicks, K.noisyBot, K.statusCheck, K.queue, K.noReview];
    const many = Array.from({ length: 10 }, (_, i) =>
      pain({
        id: `P${i + 1}`,
        thisWeek: i < 5 ? [keys[i]] : [],
        lastWeek: i >= 5 && i < 8 ? [[K.noisyLast, K.dupPipelines, K.noisyBot][i - 5]] : [],
      }),
    );
    many.push(pain({ id: "P11", thisWeek: [], lastWeek: [] }));
    const { analysis } = validateAnalysis(raw({ painPoints: many }), ctx);
    expect(analysis.painPoints).toHaveLength(8);
    expect(analysis.painPoints.slice(0, 5).every((p) => p.thisWeek.length === 1)).toBe(true);
  });

  it("gives a duplicate or missing id a fresh one so sprint suggestions stay unambiguous", () => {
    const { analysis } = validateAnalysis(
      raw({
        painPoints: [
          pain({ id: "P1", thisWeek: [K.nitpicks, K.noisyBot] }),
          pain({ id: "P1", thisWeek: [K.queue] }),
          pain({ id: "  ", thisWeek: [K.statusCheck] }),
        ],
      }),
      ctx,
    );
    const ids = analysis.painPoints.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("P1");
  });

  it("maps an unknown category to code-review-general, or to the first category when that is not configured", () => {
    const unknown = raw({ painPoints: [pain({ category: "made-up", thisWeek: [K.nitpicks] })] });
    expect(validateAnalysis(unknown, ctx).analysis.painPoints[0].category).toBe("code-review-general");

    const withoutGeneral = {
      ...ctx,
      config: { ...testConfig, categories: testConfig.categories.filter((c) => c.slug !== "code-review-general") },
    };
    expect(validateAnalysis(unknown, withoutGeneral).analysis.painPoints[0].category).toBe("review-noise");
  });
});

describe("validateAnalysis: quotes", () => {
  const quoted = (key: string, text: string, keys: string[] = [K.nitpicks]) =>
    validateAnalysis(raw({ painPoints: [pain({ thisWeek: keys, quote: { key, text } })] }), ctx);

  it("keeps a verbatim quote, ignoring case, spacing and quotation marks", () => {
    const { analysis, citations } = quoted(K.nitpicks, '  "Most are NITPICKS the linter   already catches"  ');
    expect(analysis.painPoints[0].quote).toEqual({
      threadKey: K.nitpicks,
      text: "Most are NITPICKS the linter already catches",
    });
    expect(citations).toEqual({ cited: 2, valid: 2, dropped: 0 });
  });

  it("keeps a verbatim quote with a leading or trailing ellipsis", () => {
    expect(quoted(K.nitpicks, "…so the team stopped reading them...").analysis.painPoints[0].quote).not.toBeNull();
  });

  it("drops a fabricated or paraphrased quote", () => {
    const { analysis, citations } = quoted(K.nitpicks, "AI reviewers are useless and we are switching tools");
    expect(analysis.painPoints[0].quote).toBeNull();
    expect(citations).toEqual({ cited: 2, valid: 1, dropped: 1 });
    expect(quoted(K.nitpicks, "Most comments are nitpicks the linter catches").analysis.painPoints[0].quote).toBeNull();
  });

  it("drops a quote from a thread the pain point does not cite, even if verbatim", () => {
    const text = "nobody owns the queue";
    expect(quoted(K.queue, text).analysis.painPoints[0].quote).toBeNull();
    expect(quoted(K.queue, text, [K.nitpicks, K.queue]).analysis.painPoints[0].quote?.threadKey).toBe(K.queue);
  });

  it("drops a quote with an unknown key or too little text to prove anything", () => {
    expect(quoted("hackernews:1", "Most are nitpicks the linter already catches").analysis.painPoints[0].quote).toBeNull();
    expect(quoted(K.nitpicks, "PR.").analysis.painPoints[0].quote).toBeNull();
  });
});

describe("validateAnalysis: other sections", () => {
  it("keeps only valid keys (either week) in underserved, objections and watchlist, dropping empty entries", () => {
    const { analysis, citations } = validateAnalysis(
      raw({
        underserved: [
          {
            problem: "No tool tells reviewers which PR blocks a release",
            whyUnderserved: "Queue tools only sort by age",
            toolsMentioned: ["GitHub", "github", " Linear ", "", "A", "B", "C", "D"],
            opportunity: "Priority-aware review queue",
            threadKeys: [K.queue, K.noisyLast, "devto:000"],
          },
          { problem: "Invented problem", whyUnderserved: "", toolsMentioned: [], opportunity: "", threadKeys: ["x:1"] },
        ],
        objections: [
          { objection: "We ship without review", context: "Fast-moving teams", threadKeys: [K.noReview, K.old] },
          { objection: "No evidence", context: "", threadKeys: [] },
        ],
        watchlist: [
          { signal: "Duplicate GitLab pipelines", threadKeys: [K.dupPipelines] },
          { signal: "Made up", threadKeys: ["hackernews:0"] },
        ],
      }),
      ctx,
    );
    expect(analysis.underserved).toHaveLength(1);
    expect(analysis.underserved[0].threadKeys).toEqual([K.queue, K.noisyLast]);
    expect(analysis.underserved[0].toolsMentioned).toEqual(["GitHub", "Linear", "A", "B", "C"]);
    expect(analysis.objections).toEqual([
      { objection: "We ship without review", context: "Fast-moving teams", threadKeys: [K.noReview] },
    ]);
    expect(analysis.watchlist).toEqual([{ signal: "Duplicate GitLab pipelines", threadKeys: [K.dupPipelines] }]);
    // 3 + 1 underserved keys, 2 + 0 objection keys, 1 + 1 watchlist keys; 4 of the 8 are real
    expect(citations).toEqual({ cited: 8, valid: 4, dropped: 4 });
  });

  it("filters sprint suggestions to surviving pain point ids and drops those left with none", () => {
    const { analysis } = validateAnalysis(
      raw({
        painPoints: [pain({ id: "P1", thisWeek: [K.nitpicks] }), pain({ id: "P2", thisWeek: ["fake:1"] })],
        sprintSuggestions: [
          { suggestion: "Confidence threshold for bot comments", rationale: "Cut noise", painPointIds: ["P1", "P2", "P1"] },
          { suggestion: "Something for P2", rationale: "", painPointIds: ["P2"] },
          { suggestion: "Untethered idea", rationale: "", painPointIds: [] },
        ],
      }),
      ctx,
    );
    expect(analysis.sprintSuggestions).toEqual([
      { suggestion: "Confidence threshold for bot comments", rationale: "Cut noise", painPointIds: ["P1"] },
    ]);
  });

  it("builds evidence for every surviving key, using this week's mentions for this-week threads", () => {
    const { analysis } = validateAnalysis(
      raw({
        painPoints: [pain({ thisWeek: [K.noisyBot], lastWeek: [K.noisyBot, K.dupPipelines] })],
        objections: [{ objection: "Too noisy", context: "", threadKeys: [K.noisyLast] }],
      }),
      ctx,
    );
    expect(Object.keys(analysis.evidence).sort()).toEqual([K.noisyBot, K.dupPipelines, K.noisyLast].sort());
    expect(analysis.evidence[K.noisyBot]).toEqual(toThreadRef(T.noisyBot, 3));
    expect(analysis.evidence[K.noisyBot].mentions).toBe(3);
    expect(analysis.evidence[K.dupPipelines].mentions).toBe(1);
    expect(analysis.evidence[K.noisyLast].mentions).toBe(3);
  });

  it("trims long text and fills an empty headline", () => {
    const long = "word ".repeat(200);
    const { analysis } = validateAnalysis(
      raw({
        headline: long,
        painPoints: [pain({ title: long, summary: long, thisWeek: [K.nitpicks] })],
        caveats: [long, "  ", "Only one source this week.", "a", "b", "c"],
      }),
      ctx,
    );
    expect(analysis.headline.length).toBeLessThanOrEqual(240);
    expect(analysis.headline.endsWith("…")).toBe(true);
    expect(analysis.painPoints[0].title.length).toBeLessThanOrEqual(80);
    expect(analysis.painPoints[0].summary.length).toBeLessThanOrEqual(360);
    expect(analysis.caveats).toHaveLength(4);
    expect(analysis.caveats[1]).toBe("Only one source this week.");

    const quiet = validateAnalysis(raw({ headline: "   " }), ctx).analysis.headline;
    expect(quiet).toMatch(/^Quiet week/);
  });

  it("handles an empty reply: no claims, no evidence, nothing cited, still a valid Analysis", () => {
    const { analysis, citations } = validateAnalysis(raw(), ctx);
    expect(analysis.painPoints).toEqual([]);
    expect(analysis.evidence).toEqual({});
    expect(citations).toEqual({ cited: 0, valid: 0, dropped: 0 });
    expect(AnalysisSchema.safeParse({ ...analysis, mode: "ai", model: "gemini-test" }).success).toBe(true);
  });

  it("produces output that satisfies the stored Analysis contract", () => {
    const { analysis } = validateAnalysis(
      raw({
        painPoints: [
          pain({
            thisWeek: [K.nitpicks, K.noisyBot],
            lastWeek: [K.noisyLast],
            quote: { key: K.nitpicks, text: "the team stopped reading them" },
          }),
        ],
        underserved: [
          { problem: "p", whyUnderserved: "w", toolsMentioned: ["SonarQube"], opportunity: "o", threadKeys: [K.statusCheck] },
        ],
        sprintSuggestions: [{ suggestion: "s", rationale: "r", painPointIds: ["P1"] }],
      }),
      ctx,
    );
    expect(AnalysisSchema.parse({ ...analysis, mode: "ai", model: "gemini-test" })).toBeTruthy();
  });
});

describe("helpers", () => {
  it("clip collapses whitespace and cuts on a word boundary with an ellipsis", () => {
    expect(clip("  a  b\n c ", 10)).toBe("a b c");
    expect(clip("alpha beta gamma delta", 12)).toBe("alpha beta…");
    expect(clip("abcdefghijklmnop", 6)).toBe("abcde…");
  });

  it("isVerbatimQuote needs a real substring of the excerpt", () => {
    const excerpt = 'He said: "it’s   too noisy" for us.';
    expect(isVerbatimQuote("It's too noisy for us.", excerpt)).toBe(true);
    expect(isVerbatimQuote("it is too noisy for us", excerpt)).toBe(false);
  });

  it("uniqueStrings trims, clips, de-duplicates case-insensitively and caps", () => {
    expect(uniqueStrings([" a ", "A", "", "b", "c"], 2, 10)).toEqual(["a", "b"]);
  });

  it("prioritizeThreads interleaves ranked this-week and last-week-only threads, and drops older ones", () => {
    const order = prioritizeThreads([
      makeThread("devto:1", { mentionsByWeek: [0, 0, 5, 0] }),
      makeThread("devto:2", { mentionsByWeek: [0, 0, 0, 1], engagement: { comments: 9 } }),
      makeThread("devto:3", { mentionsByWeek: [0, 0, 0, 2] }),
      makeThread("devto:4", { mentionsByWeek: [0, 0, 0, 1], engagement: { comments: 9, points: 50 } }),
      makeThread("devto:5", { mentionsByWeek: [4, 4, 0, 0] }),
      makeThread("devto:6", { mentionsByWeek: [0, 0, 1, 0] }),
    ]).map((t) => t.threadKey);
    // this week ranked: 3, 4, 2 · last week only ranked: 1, 6 → interleaved
    expect(order).toEqual(["devto:3", "devto:1", "devto:4", "devto:6", "devto:2"]);
  });

  it("toThreadRef reports the mentions of the requested week", () => {
    expect(toThreadRef(T.noisyBot, 2)).toMatchObject({ threadKey: K.noisyBot, mentions: 2, postedAt: T.noisyBot.firstPostedAt });
  });
});
