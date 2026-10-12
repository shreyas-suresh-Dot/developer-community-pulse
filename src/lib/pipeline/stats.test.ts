import { describe, expect, it } from "vitest";
import { StatsSchema, type PulseConfig } from "../contracts";
import { fourWeeks } from "../weeks";
import { buildStats, mergeEngagement, threadRef } from "./stats";
import type { MatchedMention } from "./types";

const weeks = fourWeeks("2026-10-09");
const at = (week: number, hours = 12) => new Date(Date.parse(weeks[week].start) + hours * 3_600_000).toISOString();

const config: PulseConfig = {
  categories: [
    { id: "a", slug: "review-noise", name: "Noise", description: "", sortOrder: 10, keywords: [{ keyword: "false positive", requiresContext: true }] },
    {
      id: "b",
      slug: "ci-cd",
      name: "CI/CD",
      description: "",
      sortOrder: 50,
      keywords: [
        { keyword: "GitHub Actions", requiresContext: false },
        { keyword: "flaky test", requiresContext: false },
      ],
    },
    { id: "c", slug: "static-analysis", name: "Static analysis", description: "", sortOrder: 60, keywords: [{ keyword: "linter", requiresContext: false }] },
    { id: "d", slug: "quiet-topic", name: "Quiet", description: "", sortOrder: 70, keywords: [{ keyword: "SonarQube", requiresContext: false }] },
  ],
  contextTerms: ["PR"],
  sources: [
    { slug: "hackernews", name: "Hacker News", isActive: true, tags: [], includeComments: true },
    { slug: "stackoverflow", name: "Stack Overflow", isActive: true, tags: ["github-actions"], includeComments: true },
    { slug: "devto", name: "DEV Community", isActive: true, tags: ["cicd"], includeComments: true },
  ],
  configHash: "hash",
};

type Spec = Pick<MatchedMention, "source" | "externalId" | "threadKey" | "weekIndex" | "matchedKeywords" | "matchedCategories"> &
  Partial<MatchedMention>;

function mm(spec: Spec): MatchedMention {
  return {
    kind: spec.source === "hackernews" ? "comment" : spec.source === "stackoverflow" ? "question" : "article",
    threadTitle: `Title of ${spec.threadKey}`,
    url: `https://example.com/${spec.externalId}`,
    threadUrl: `https://example.com/${spec.threadKey}`,
    text: "",
    contextText: "",
    excerpt: `excerpt ${spec.externalId}`,
    author: null,
    postedAt: spec.postedAt ?? at(Math.min(Math.max(spec.weekIndex, 0), 3)),
    engagement: {},
    ...spec,
  };
}

const hnEngagement = { points: 50, comments: 30 };
const mentions: MatchedMention[] = [
  // This week (index 3)
  mm({ source: "hackernews", externalId: "1", kind: "story", threadKey: "hackernews:1", weekIndex: 3, postedAt: at(3, 2), matchedKeywords: ["flaky test"], matchedCategories: ["ci-cd"], engagement: hnEngagement }),
  mm({ source: "hackernews", externalId: "1c1", threadKey: "hackernews:1", weekIndex: 3, postedAt: at(3, 5), matchedKeywords: ["flaky test"], matchedCategories: ["ci-cd"], engagement: hnEngagement }),
  mm({ source: "hackernews", externalId: "1c2", threadKey: "hackernews:1", weekIndex: 3, postedAt: at(3, 8), matchedKeywords: ["GitHub Actions", "flaky test"], matchedCategories: ["ci-cd"], engagement: hnEngagement }),
  mm({ source: "hackernews", externalId: "2c1", threadKey: "hackernews:2", weekIndex: 3, matchedKeywords: ["false positive", "linter"], matchedCategories: ["review-noise", "static-analysis"], engagement: { points: 10, comments: 5 } }),
  mm({ source: "stackoverflow", externalId: "10", threadKey: "stackoverflow:10", weekIndex: 3, matchedKeywords: ["GitHub Actions"], matchedCategories: ["ci-cd"], engagement: { points: 1, answers: 0, views: 100, isAnswered: false, hasAcceptedAnswer: false } }),
  mm({ source: "stackoverflow", externalId: "11", threadKey: "stackoverflow:11", weekIndex: 3, matchedKeywords: ["GitHub Actions"], matchedCategories: ["ci-cd"], engagement: { points: 5, answers: 1, views: 500, isAnswered: true, hasAcceptedAnswer: true } }),
  mm({ source: "stackoverflow", externalId: "12", threadKey: "stackoverflow:12", weekIndex: 3, matchedKeywords: ["linter"], matchedCategories: ["static-analysis"], engagement: { points: 0, answers: 2, views: 300, isAnswered: true, hasAcceptedAnswer: false } }),
  mm({ source: "devto", externalId: "20", threadKey: "devto:20", weekIndex: 3, matchedKeywords: ["GitHub Actions"], matchedCategories: ["ci-cd"], engagement: { comments: 2, reactions: 40 } }),
  // Last week (index 2)
  mm({ source: "hackernews", externalId: "1c0", threadKey: "hackernews:1", weekIndex: 2, matchedKeywords: ["flaky test"], matchedCategories: ["ci-cd"], engagement: hnEngagement }),
  mm({ source: "stackoverflow", externalId: "13", threadKey: "stackoverflow:13", weekIndex: 2, matchedKeywords: ["GitHub Actions"], matchedCategories: ["ci-cd"], engagement: { views: 900, hasAcceptedAnswer: false } }),
  // Oldest week (index 0)
  mm({ source: "devto", externalId: "21", threadKey: "devto:21", weekIndex: 0, matchedKeywords: ["linter"], matchedCategories: ["static-analysis"] }),
  // Invalid week index: ignored
  mm({ source: "devto", externalId: "99", threadKey: "devto:99", weekIndex: 7, matchedKeywords: ["linter"], matchedCategories: ["static-analysis"] }),
];

describe("buildStats", () => {
  const { stats, threads } = buildStats({ config, weeks, mentions, sourceResults: [] });

  it("produces stats that satisfy the stored contract", () => {
    expect(() => StatsSchema.parse(stats)).not.toThrow();
    expect(stats.weeks).toEqual(weeks);
  });

  it("counts mentions and distinct threads per week", () => {
    expect(stats.totals).toEqual({ mentions: [1, 0, 2, 8], threads: [1, 0, 2, 6] });
    expect(stats.sources).toEqual([
      { source: "hackernews", name: "Hacker News", mentions: [0, 0, 1, 4], threads: [0, 0, 1, 2] },
      { source: "stackoverflow", name: "Stack Overflow", mentions: [0, 0, 1, 3], threads: [0, 0, 1, 3] },
      { source: "devto", name: "DEV Community", mentions: [1, 0, 0, 1], threads: [1, 0, 0, 1] },
    ]);
  });

  it("sorts categories by this week's threads, keeps zero-volume ones and labels the change on threads", () => {
    expect(stats.categories.map((c) => [c.slug, c.threads[3]])).toEqual([
      ["ci-cd", 4],
      ["static-analysis", 2],
      ["review-noise", 1],
      ["quiet-topic", 0],
    ]);
    const ci = stats.categories[0];
    expect(ci.mentions).toEqual([0, 0, 2, 6]);
    expect(ci.threads).toEqual([0, 0, 2, 4]);
    expect(ci.change).toMatchObject({ current: 4, previous: 2, abs: 2, pct: 100, trend: "steady" });
    expect(ci.verified).toBeNull();
    expect(stats.categories[3]).toMatchObject({ mentions: [0, 0, 0, 0], change: { trend: "quiet" } });
  });

  it("lists only keywords seen in the 4 weeks, sorted by this week's mentions", () => {
    expect(stats.keywords.map((k) => [k.keyword, k.category, k.mentions])).toEqual([
      ["GitHub Actions", "ci-cd", [0, 0, 1, 4]],
      ["flaky test", "ci-cd", [0, 0, 1, 3]],
      ["linter", "static-analysis", [1, 0, 0, 2]],
      ["false positive", "review-noise", [0, 0, 0, 1]],
    ]);
    expect(stats.keywords[0].change).toMatchObject({ current: 4, previous: 1, abs: 3, pct: 300, trend: "rising" });
  });

  it("ranks top threads by this week's mentions, then comments, points and reactions", () => {
    expect(stats.topThreads.map((t) => t.threadKey)).toEqual([
      "hackernews:1",
      "hackernews:2",
      "devto:20",
      "stackoverflow:11",
      "stackoverflow:10",
      "stackoverflow:12",
    ]);
    const top = stats.topThreads[0];
    expect(top).toMatchObject({ mentions: 3, postedAt: at(3, 2), excerpt: "excerpt 1c2", engagement: hnEngagement });
    expect(top.keywords).toEqual(["GitHub Actions", "flaky test"]);
    expect(top.url).toBe("https://example.com/hackernews:1");
  });

  it("lists this week's Stack Overflow questions without an accepted answer, most viewed first", () => {
    expect(stats.unanswered.map((t) => t.threadKey)).toEqual(["stackoverflow:12", "stackoverflow:10"]);
  });

  it("aggregates threads over the 4 weeks", () => {
    const thread = threads.get("hackernews:1");
    expect(thread).toMatchObject({ mentionsByWeek: [0, 0, 1, 3], firstPostedAt: at(2), excerpt: "excerpt 1c2", categories: ["ci-cd"] });
    expect(threads.has("devto:99")).toBe(false);
  });

  it("describes a thread as it looked in a given week", () => {
    const thread = threads.get("hackernews:1");
    if (!thread) throw new Error("missing thread");
    const lastWeek = threadRef(thread, 2);
    expect(lastWeek).toMatchObject({ mentions: 1, postedAt: at(2), excerpt: "excerpt 1c0", keywords: ["flaky test"] });
    expect(threadRef(thread, 1)).toMatchObject({ mentions: 0, postedAt: at(2) });
    expect(() => threadRef(thread, 4)).toThrow(RangeError);
    const copy = { ...thread };
    expect(threadRef(copy, 3)).toMatchObject({ mentions: 3, excerpt: "excerpt 1c2", keywords: ["GitHub Actions", "flaky test"] });
  });

  it("caps top threads at 12 and needs exactly 4 weeks", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      mm({ source: "devto", externalId: `m${i}`, threadKey: `devto:m${i}`, weekIndex: 3, matchedKeywords: ["linter"], matchedCategories: ["static-analysis"] }),
    );
    expect(buildStats({ config, weeks, mentions: many, sourceResults: [] }).stats.topThreads).toHaveLength(12);
    expect(() => buildStats({ config, weeks: weeks.slice(1), mentions: [], sourceResults: [] })).toThrow(/4 weeks/);
  });
});

describe("mergeEngagement", () => {
  it("keeps the best value per field", () => {
    expect(mergeEngagement({ points: 3, isAnswered: false }, { points: 1, comments: 4, isAnswered: true })).toEqual({
      points: 3,
      comments: 4,
      isAnswered: true,
    });
  });
});
