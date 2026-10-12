import { describe, expect, it } from "vitest";
import type { PulseConfig } from "../contracts";
import { fourWeeks } from "../weeks";
import { buildMatcher, keywordRegex, matchMentions } from "./matching";
import type { RawMention } from "./types";

const matches = (keyword: string, text: string) => keywordRegex(keyword).test(text);

describe("keywordRegex", () => {
  it("is case-insensitive and tolerates a plural s/es", () => {
    expect(matches("flaky test", "Our FLAKY TESTS keep failing")).toBe(true);
    expect(matches("linter", "two linters disagree")).toBe(true);
    expect(matches("LGTM", "just lgtms everywhere")).toBe(true);
    expect(matches("merge queue", "merge queues are great")).toBe(true);
    expect(matches("nitpick", "nitpicking")).toBe(false);
  });

  it("treats space, hyphen, underscore and no separator as the same spelling", () => {
    for (const text of ["code review", "code-review", "code_review", "codereview", "Code  Review", "code\nreview"]) {
      expect(matches("code review", text)).toBe(true);
    }
    expect(matches("pre-commit", "a pre commit hook")).toBe(true);
    expect(matches("pre-commit", "precommit")).toBe(true);
    expect(matches("pre-commit", "the [pre-commit-hook] tag")).toBe(true);
    expect(matches("trunk-based development", "trunk based development")).toBe(true);
  });

  it("handles CI/CD boundaries and slash spellings", () => {
    expect(matches("CI/CD", "our CI/CD pipeline")).toBe(true);
    expect(matches("CI/CD", "(CI/CD)")).toBe(true);
    expect(matches("CI/CD", "ci-cd, cicd and CI / CD")).toBe(true);
    expect(matches("CI/CD", "CI/CDs")).toBe(true);
    expect(matches("CI/CD", "xCI/CD")).toBe(false);
    expect(matches("CI/CD", "CI/CDX")).toBe(false);
    expect(matches("CI/CD", "CI only")).toBe(false);
  });

  it("never matches inside a longer word", () => {
    expect(matches("linter", "splinter")).toBe(false);
    expect(matches("SAST", "disastrous")).toBe(false);
    expect(matches("PR review", "prereview")).toBe(false);
    expect(matches("PR review", "PR reviewer")).toBe(false);
    expect(matches("PR review", "a PR review")).toBe(true);
    expect(matches("Jenkins", "Jenkinsfile")).toBe(false);
  });

  it("uses Unicode-aware boundaries for non-ASCII text", () => {
    expect(matches("linter", "élinter")).toBe(false);
    expect(matches("linter", "der Linter läuft")).toBe(true);
    expect(matches("code review", "代码 code review 很慢")).toBe(true);
    expect(matches("code review", "code reviewé")).toBe(false);
    expect(matches("ESLint", "«ESLint»")).toBe(true);
  });

  it("escapes regex specials in keywords", () => {
    expect(matches("C++", "modern C++ tooling")).toBe(true);
    expect(matches("node.js", "nodexjs")).toBe(false);
    expect(matches("node.js", "Node.js apps")).toBe(true);
  });
});

const config: PulseConfig = {
  categories: [
    {
      id: "1",
      slug: "review-noise",
      name: "Noise",
      description: "",
      sortOrder: 10,
      keywords: [
        { keyword: "false positive", requiresContext: true },
        { keyword: "linter", requiresContext: false },
      ],
    },
    {
      id: "2",
      slug: "static-analysis",
      name: "Static analysis",
      description: "",
      sortOrder: 60,
      keywords: [{ keyword: "linter", requiresContext: false }],
    },
    {
      id: "3",
      slug: "code-review-general",
      name: "General",
      description: "",
      sortOrder: 90,
      keywords: [{ keyword: "code review", requiresContext: false }],
    },
  ],
  contextTerms: ["pull request", "PR", "CI"],
  sources: [],
  configHash: "test",
};

function mention(overrides: Partial<RawMention>): RawMention {
  return {
    source: "hackernews",
    externalId: "1",
    kind: "comment",
    threadKey: "hackernews:100",
    threadTitle: "A thread",
    url: "https://news.ycombinator.com/item?id=1",
    threadUrl: "https://news.ycombinator.com/item?id=100",
    text: "",
    contextText: "",
    excerpt: "",
    author: "someone",
    postedAt: "2026-10-05T10:00:00.000Z",
    engagement: {},
    ...overrides,
  };
}

describe("buildMatcher", () => {
  const matcher = buildMatcher(config);

  it("drops a context-requiring keyword without a context term (medical false positive)", () => {
    const result = matcher.match(mention({ text: "The test gave a false positive for the virus." }));
    expect(result).toEqual({ keywords: [], categories: [], droppedNoContext: true });
  });

  it("counts it when a context term is present in the post", () => {
    const result = matcher.match(mention({ text: "Our bot leaves a false positive on every PR." }));
    expect(result).toEqual({ keywords: ["false positive"], categories: ["review-noise"], droppedNoContext: false });
  });

  it("accepts context from the story title but never matches keywords there", () => {
    const withContext = matcher.match(mention({ text: "So many false positives.", contextText: "Ask HN: Is CI worth it?" }));
    expect(withContext.keywords).toEqual(["false positive"]);
    const keywordOnlyInTitle = matcher.match(mention({ text: "I agree.", contextText: "Code review is broken" }));
    expect(keywordOnlyInTitle).toEqual({ keywords: [], categories: [], droppedNoContext: false });
  });

  it("assigns every category a keyword belongs to, in config order", () => {
    const result = matcher.match(mention({ text: "Code review bots and linters" }));
    expect(result.keywords).toEqual(["linter", "code review"]);
    expect(result.categories).toEqual(["review-noise", "static-analysis", "code-review-general"]);
    expect(result.droppedNoContext).toBe(false);
  });

  it("is not 'dropped' when a context-free keyword also matched", () => {
    const result = matcher.match(mention({ text: "A linter with a false positive" }));
    expect(result.keywords).toEqual(["linter"]);
    expect(result.droppedNoContext).toBe(false);
  });

  it("locates the first hit of the given keywords", () => {
    expect(matcher.firstHit("x linter y code-review", ["code review", "linter"])).toEqual({ index: 2, length: 6 });
    expect(matcher.firstHit("nothing", ["linter"])).toBeNull();
  });
});

describe("matchMentions", () => {
  const weeks = fourWeeks("2026-10-09");
  const matcher = buildMatcher(config);

  it("assigns weeks, drops posts outside the window and counts context drops", () => {
    const summary = matchMentions(
      [
        mention({ externalId: "a", text: "code review", postedAt: "2026-10-05T10:00:00.000Z" }),
        mention({ externalId: "b", text: "code review", postedAt: "2026-09-12T00:00:00.000Z" }),
        mention({ externalId: "c", text: "code review", postedAt: "2026-10-09T00:00:00.000Z" }),
        mention({ externalId: "d", text: "false positive in the lab" }),
        mention({ externalId: "e", text: "nothing relevant" }),
        mention({ externalId: "a", text: "code review" }),
      ],
      matcher,
      weeks,
    );
    expect(summary.mentions.map((m) => [m.externalId, m.weekIndex])).toEqual([
      ["a", 3],
      ["b", 0],
    ]);
    expect(summary.mentions[0].matchedKeywords).toEqual(["code review"]);
    expect(summary.mentions[0].matchedCategories).toEqual(["code-review-general"]);
    expect(summary.outsideWindow).toBe(1);
    expect(summary.droppedNoContext).toBe(1);
  });

  it("re-centres a long comment's excerpt on the first keyword hit", () => {
    const text = `${"blah ".repeat(200)}honestly our linter is the bottleneck ${"more ".repeat(50)}`.trim();
    const [m] = matchMentions([mention({ text, excerpt: text.slice(0, 499) })], matcher, weeks).mentions;
    expect(m.excerpt).toContain("our linter is the bottleneck");
    expect(m.excerpt.length).toBeLessThanOrEqual(500);
  });
});
