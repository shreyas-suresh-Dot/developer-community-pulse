import type { SourceSlug } from "../../contracts";
import { fourWeeks } from "../../weeks";
import type { ThreadAgg } from "../types";

/* Small, hand-checked thread set for the validate / fallback / synthesize tests. Week index 3 = this week. */

export const WEEK_END = "2026-10-09";
export const weeks = fourWeeks(WEEK_END);

const SOURCES: Record<string, SourceSlug> = {
  hackernews: "hackernews",
  stackoverflow: "stackoverflow",
  devto: "devto",
};

const URLS: Record<SourceSlug, (id: string) => string> = {
  hackernews: (id) => `https://news.ycombinator.com/item?id=${id}`,
  stackoverflow: (id) => `https://stackoverflow.com/questions/${id}`,
  devto: (id) => `https://dev.to/someone/post-${id}`,
};

export function makeThread(threadKey: string, overrides: Partial<ThreadAgg> = {}): ThreadAgg {
  const [prefix = "", id = "0"] = threadKey.split(":");
  const source = SOURCES[prefix] ?? "hackernews";
  return {
    threadKey,
    source,
    title: `Thread ${threadKey}`,
    url: URLS[source](id),
    mentionsByWeek: [0, 0, 0, 1],
    categories: ["code-review-general"],
    keywords: ["code review"],
    engagement: {},
    firstPostedAt: "2026-10-05T10:00:00.000Z",
    excerpt: `Excerpt of ${threadKey}.`,
    ...overrides,
  };
}

export const T = {
  aiNitpicks: makeThread("hackernews:1001", {
    title: "Ask HN: Do AI code review bots actually help your team?",
    mentionsByWeek: [0, 0, 0, 4],
    categories: ["review-noise", "ai-code-review"],
    keywords: ["false positive", "nitpick", "AI reviewer"],
    engagement: { points: 210, comments: 160 },
    excerpt:
      "Our AI reviewer leaves 40 comments per PR. Most are nitpicks the linter already catches, so the team stopped reading them and real bugs slip through.",
  }),
  noisyBot: makeThread("hackernews:1002", {
    title: "Static analysis bots are too noisy",
    mentionsByWeek: [0, 0, 2, 3],
    categories: ["review-noise", "static-analysis"],
    keywords: ["false positive", "static analysis"],
    engagement: { points: 95, comments: 70 },
    firstPostedAt: "2026-09-29T08:00:00.000Z",
    excerpt:
      "The false positive rate of our static analysis bot is so high that we added a \"wontfix\" label just to close its comments.",
  }),
  statusCheck: makeThread("stackoverflow:2001", {
    title: "Required status check stuck on 'Expected — Waiting for status to be reported'",
    mentionsByWeek: [0, 0, 0, 1],
    categories: ["ci-cd"],
    keywords: ["GitHub Actions", "status check"],
    engagement: { answers: 0, views: 120, isAnswered: false },
    excerpt:
      "Required status check is stuck on 'Expected — Waiting for status to be reported' after renaming the GitHub Actions job.",
  }),
  reviewQueue: makeThread("devto:3001", {
    title: "Our PR review queue is killing velocity",
    mentionsByWeek: [0, 0, 0, 2],
    categories: ["review-speed"],
    keywords: ["waiting for review", "review bottleneck"],
    engagement: { comments: 12, reactions: 40 },
    excerpt: "PRs wait three days for a first review. We tried rotating reviewers but nobody owns the queue.",
  }),
  noisyLastWeek: makeThread("hackernews:1003", {
    title: "Every AI code review tool we tried was too noisy",
    mentionsByWeek: [0, 1, 3, 0],
    categories: ["review-noise", "ai-code-review"],
    keywords: ["too noisy", "AI code review"],
    engagement: { points: 60, comments: 41 },
    firstPostedAt: "2026-09-24T08:00:00.000Z",
    excerpt: "Every AI code review tool we trialled was too noisy for a team of our size.",
  }),
  duplicatePipelines: makeThread("stackoverflow:2002", {
    title: "GitLab CI runs duplicate pipelines for branch and MR",
    mentionsByWeek: [0, 0, 1, 0],
    categories: ["ci-cd"],
    keywords: ["GitLab CI", "merge request"],
    engagement: { answers: 1, isAnswered: true },
    firstPostedAt: "2026-09-30T08:00:00.000Z",
    excerpt: "GitLab CI runs duplicate pipelines for branch and merge request events.",
  }),
  oldThread: makeThread("devto:3002", {
    title: "An old thread outside the compared weeks",
    mentionsByWeek: [2, 0, 0, 0],
    categories: ["code-review-general"],
    firstPostedAt: "2026-09-12T08:00:00.000Z",
  }),
  noReview: makeThread("hackernews:1004", {
    title: "We ship without code review",
    mentionsByWeek: [0, 0, 0, 1],
    categories: ["review-culture"],
    keywords: ["without code review", "pair programming"],
    engagement: { points: 40, comments: 33 },
    excerpt:
      "We ship without code review and rely on tests plus pair programming; reviews were rubber stamps anyway.",
  }),
} satisfies Record<string, ThreadAgg>;

export const fixtureThreads: ThreadAgg[] = Object.values(T);

export function threadMap(threads: readonly ThreadAgg[] = fixtureThreads): Map<string, ThreadAgg> {
  return new Map(threads.map((t) => [t.threadKey, t]));
}
