import type { BriefRecord, CategoryStat, Engagement, KeywordStat, RunRecord, ThreadRef } from "@/lib/contracts";
import type { BriefSummary } from "@/lib/data";
import { change } from "@/lib/pipeline/trend";
import { fourWeeks } from "@/lib/weeks";

/*
 * Sample data for local UI work (PULSE_FIXTURE=1) and tests. It mirrors a realistic Friday run so every
 * section of the brief has something to render: counts and trends go through the real change() and
 * fourWeeks() helpers, and every quote is a verbatim substring of its thread's excerpt, as the
 * pipeline's validator requires. Thread ids and URLs are plausible, not real.
 */

type Four = [number, number, number, number];

const WEEK_END = "2026-10-09";
const weeks = fourWeeks(WEEK_END);

function hn(id: number, title: string, postedAt: string, points: number, comments: number, extra: Extra): ThreadRef {
  return thread(`hackernews:${id}`, "hackernews", title, `https://news.ycombinator.com/item?id=${id}`, postedAt, { points, comments }, extra);
}

function so(id: number, slug: string, title: string, postedAt: string, answers: number, views: number, accepted: boolean, extra: Extra): ThreadRef {
  return thread(`stackoverflow:${id}`, "stackoverflow", title, `https://stackoverflow.com/questions/${id}/${slug}`, postedAt, {
    answers,
    views,
    isAnswered: answers > 0,
    hasAcceptedAnswer: accepted,
  }, extra);
}

function dev(id: number, path: string, title: string, postedAt: string, reactions: number, comments: number, extra: Extra): ThreadRef {
  return thread(`devto:${id}`, "devto", title, `https://dev.to/${path}`, postedAt, { reactions, comments }, extra);
}

type Extra = { categories: string[]; keywords: string[]; excerpt: string; mentions?: number };

function thread(
  threadKey: string,
  source: ThreadRef["source"],
  title: string,
  url: string,
  postedAt: string,
  engagement: Engagement,
  { categories, keywords, excerpt, mentions = 1 }: Extra,
): ThreadRef {
  return { threadKey, source, title, url, postedAt, mentions, engagement, categories, keywords, excerpt };
}

/* ----------------------------- This week's threads (2 – 8 Oct) ----------------------------- */

const noise = [
  hn(47391204, "Ask HN: Has anyone kept an AI code reviewer enabled for more than a month?", "2026-10-05T14:12:00Z", 286, 214, {
    categories: ["review-noise", "ai-code-review"],
    keywords: ["false positive rate", "AI code review", "nitpick"],
    mentions: 9,
    excerpt:
      "We turned on an AI reviewer across 40 repos in August. The false positive rate was high enough that people stopped reading its comments after two weeks, and then they started missing the one real issue it flagged. We now run it only on PRs over 500 lines.",
  }),
  dev(2984417, "mariaokafor/i-measured-our-ai-reviewers-false-positive-rate-for-30-days-3k2p", "I measured our AI reviewer's false positive rate for 30 days", "2026-10-03T09:40:00Z", 142, 37, {
    categories: ["review-noise", "ai-code-review"],
    keywords: ["false positive rate", "AI reviewer"],
    mentions: 2,
    excerpt:
      "Out of 1,212 comments the bot left on 318 pull requests, our team marked 61% as not useful. Most were style nitpicks our linter already covers. The handful of real bugs it caught were valuable, but they were buried.",
  }),
  hn(47402771, "CodeRabbit vs. Copilot code review after six months on a 30-person team", "2026-10-06T19:03:00Z", 174, 121, {
    categories: ["ai-code-review", "review-noise"],
    keywords: ["CodeRabbit", "Copilot code review", "Greptile", "false positive"],
    mentions: 4,
    excerpt:
      "Copilot is quieter but misses context across files. CodeRabbit catches more, but the signal to noise is rough until you write a long config file, and even then it re-raises things we dismissed last week. We are trialling Greptile next.",
  }),
  so(79931842, "how-to-suppress-github-copilot-code-review-comments-for-generated-files", "How to suppress GitHub Copilot code review comments for generated files?", "2026-10-04T11:20:00Z", 1, 486, false, {
    categories: ["review-noise", "ai-code-review"],
    keywords: ["Copilot code review", "false positive"],
    excerpt:
      "Copilot code review keeps commenting on our protobuf-generated files with the same false positive about unused imports. Is there a way to exclude paths or specific rule types? Marking them linguist-generated in .gitattributes did not help.",
  }),
  dev(2986120, "tomasz_dev/our-ai-code-reviewer-was-right-1-time-out-of-9-4hfd", "Our AI code reviewer was right 1 time out of 9. Here's how we tuned it", "2026-10-07T07:15:00Z", 88, 19, {
    categories: ["review-noise", "ai-code-review"],
    keywords: ["AI code review", "false positive rate"],
    excerpt:
      "The biggest win was telling the bot what not to review. We excluded tests, migrations and generated clients and the false positive rate dropped by half. It still cannot learn from the comments we resolve as won't fix.",
  }),
  hn(47414388, "Show HN: Reviewbot-lite – an AI reviewer that only comments when it can prove it", "2026-10-08T15:47:00Z", 97, 58, {
    categories: ["review-noise", "ai-code-review"],
    keywords: ["false positive", "too noisy", "AI reviewer"],
    mentions: 3,
    excerpt:
      "Every AI reviewer we tried was too noisy, so I built one that stays silent unless it can point at a failing test or a concrete bug. Fewer comments, but the team actually reads them.",
  }),
  so(79936517, "make-coderabbit-stop-reopening-resolved-review-comments", "Is there a way to make CodeRabbit stop re-opening resolved review comments?", "2026-10-02T16:05:00Z", 0, 211, false, {
    categories: ["review-noise", "ai-code-review"],
    keywords: ["CodeRabbit", "bot comments"],
    excerpt:
      "Every time we push a new commit, CodeRabbit posts the same nitpick again on lines we already marked as resolved. We tried adding learnings to the config, but the bot comments keep coming back.",
  }),
];

const flaky = [
  hn(47389012, "GitHub Actions has been unreliable for us all week", "2026-10-05T08:55:00Z", 341, 187, {
    categories: ["ci-cd"],
    keywords: ["GitHub Actions", "flaky test"],
    mentions: 6,
    excerpt:
      "Half our merges this week needed a re-run because of runner timeouts, not our code. When CI is flaky people stop trusting red builds, and that is when real failures get merged.",
  }),
  so(79929984, "github-actions-job-fails-with-the-runner-has-received-a-shutdown-signal", "GitHub Actions job randomly fails with 'The runner has received a shutdown signal'", "2026-10-03T06:31:00Z", 0, 1290, false, {
    categories: ["ci-cd"],
    keywords: ["GitHub Actions"],
    excerpt:
      "Our test job fails about 1 in 10 runs with 'The runner has received a shutdown signal' on ubuntu-latest. Re-running always passes. How do we tell whether this is our tests or the runner?",
  }),
  dev(2983056, "anjali_builds/quarantining-flaky-tests-without-losing-signal-2c9a", "Quarantining flaky tests without losing signal", "2026-10-04T12:00:00Z", 121, 28, {
    categories: ["ci-cd"],
    keywords: ["flaky test", "CI pipeline"],
    excerpt:
      "We tag a flaky test, move it to a non-blocking job and open an issue automatically. It works, but it is a pile of scripts and nobody owns them.",
  }),
  so(79933471, "retry-only-failed-tests-in-a-github-actions-matrix-job", "How to retry only the failed tests in a GitHub Actions matrix job?", "2026-10-05T17:22:00Z", 2, 744, false, {
    categories: ["ci-cd"],
    keywords: ["GitHub Actions", "flaky test"],
    excerpt:
      "We have a 12-way matrix and one flaky test fails a random shard. Re-running the whole workflow takes 25 minutes. Is there a supported way to re-run only the failed tests?",
  }),
  hn(47405519, "Ask HN: How do you keep CI under 10 minutes?", "2026-10-07T03:41:00Z", 156, 133, {
    categories: ["ci-cd"],
    keywords: ["slow CI", "CI pipeline", "flaky test"],
    mentions: 5,
    excerpt:
      "Our CI went from 8 to 31 minutes in a year. Caching helped, but flaky tests and queue time for runners are now the bulk of it.",
  }),
  dev(2987702, "devopsdaniel/github-actions-cache-misses-are-killing-our-build-times-1k8n", "GitHub Actions cache misses are killing our build times", "2026-10-08T10:10:00Z", 47, 11, {
    categories: ["ci-cd"],
    keywords: ["GitHub Actions", "slow CI"],
    excerpt:
      "Since the runner image update our cache hit rate fell from 92% to 40%. Every PR now rebuilds dependencies from scratch.",
  }),
];

const aiVolume = [
  hn(47396930, "Our PR volume doubled after rolling out coding agents. Reviews didn't", "2026-10-06T09:17:00Z", 412, 298, {
    categories: ["ai-code-review", "review-speed"],
    keywords: ["AI-generated code", "review bottleneck", "code review"],
    mentions: 8,
    excerpt:
      "Engineers now open twice as many pull requests, many of them 800+ lines written by an agent. The two seniors who can review the payments code are underwater and approval quality is dropping.",
  }),
  dev(2985331, "codecraft/reviewing-ai-generated-pull-requests-a-checklist-5e1b", "Reviewing AI-generated pull requests: a checklist", "2026-10-05T06:30:00Z", 203, 41, {
    categories: ["ai-code-review"],
    keywords: ["AI-generated code", "PR review"],
    excerpt:
      "AI-generated code looks plausible line by line, which is exactly why it is hard to review. Start from the tests and the intent, not the diff.",
  }),
  hn(47410046, "Vibe coding is fine until someone has to review it", "2026-10-07T21:05:00Z", 188, 176, {
    categories: ["ai-code-review", "review-culture"],
    keywords: ["vibe coding", "AI-generated code", "large PR", "rubber stamp"],
    mentions: 4,
    excerpt:
      "Nobody wants to review a 2,000-line vibe coded PR, so it gets rubber stamped. We now require the author to explain every file in the description.",
  }),
  so(79934208, "enforce-a-maximum-pull-request-size-in-github", "How to enforce a maximum PR size in GitHub for AI-generated changes?", "2026-10-06T13:48:00Z", 1, 318, false, {
    categories: ["ai-code-review", "review-speed"],
    keywords: ["PR size", "AI-generated code"],
    excerpt:
      "Our agents open PRs with thousands of changed lines. Is there a GitHub ruleset or Action that blocks PRs above a size threshold but lets us exclude lockfiles and snapshots?",
  }),
  dev(2988035, "priya_eng/the-review-bottleneck-moved-3mb7", "The review bottleneck moved: notes from a team using coding agents", "2026-10-08T05:00:00Z", 76, 15, {
    categories: ["ai-code-review", "review-speed"],
    keywords: ["review bottleneck", "AI-generated code"],
    excerpt: "Writing code is no longer the slow part. Reviewing it is. Our cycle time is flat even though we write 60% more code.",
  }),
];

const reviewWait = [
  hn(47399208, "Ask HN: What's your team's median time to first PR review?", "2026-10-06T16:20:00Z", 132, 117, {
    categories: ["review-speed"],
    keywords: ["waiting for review", "merge queue", "stacked PR"],
    mentions: 3,
    excerpt: "Ours was 26 hours until we added a review rotation and a merge queue. Stacked PRs helped more than any tool.",
  }),
  dev(2984990, "stackedlife/stacked-prs-cut-our-review-wait-from-days-to-hours-2pfx", "Stacked PRs cut our review wait from days to hours", "2026-10-04T15:00:00Z", 95, 23, {
    categories: ["review-speed"],
    keywords: ["stacked PR", "waiting for review"],
    excerpt: "Small stacked PRs get reviewed the same day. Big ones wait until someone has a free afternoon, which is never.",
  }),
  so(79932655, "github-merge-queue-prs-removed-when-base-branch-changes", "GitHub merge queue: PRs removed from the queue when the base branch changes", "2026-10-04T09:12:00Z", 1, 402, true, {
    categories: ["review-speed"],
    keywords: ["merge queue"],
    excerpt:
      "Our PRs are removed from the merge queue whenever another PR merges first. Is there a setting to rebase and retry automatically?",
  }),
];

const qualityGates = [
  so(79930775, "sonarqube-quality-gate-fails-on-new-code-coverage-for-generated-files", "SonarQube quality gate fails on new-code coverage for generated files", "2026-10-03T12:41:00Z", 0, 267, false, {
    categories: ["static-analysis"],
    keywords: ["SonarQube", "quality gate"],
    excerpt:
      "The quality gate fails because coverage on new code is 62%, but most of the new lines are generated clients. sonar.exclusions does not seem to apply to the coverage condition.",
  }),
  dev(2986544, "platformpat/one-quality-gate-for-40-repos-doesnt-work-1b0e", "One quality gate for 40 repos doesn't work", "2026-10-07T11:30:00Z", 58, 14, {
    categories: ["static-analysis"],
    keywords: ["quality gate", "static analysis", "code quality"],
    excerpt:
      "Each team needs different thresholds, but our tooling only supports one global quality gate. Teams either ignore it or spend a sprint fighting it.",
  }),
  so(79935902, "eslint-flat-config-different-rules-per-package-in-a-monorepo", "ESLint flat config: different rules per package in a monorepo without duplicating config", "2026-10-07T08:03:00Z", 1, 355, false, {
    categories: ["static-analysis"],
    keywords: ["ESLint", "linter"],
    excerpt:
      "In our pnpm monorepo each package needs slightly different rules. With flat config we end up copying the whole config into every package.",
  }),
];

/* ----------------------------- Last week's threads (25 Sep – 1 Oct) ----------------------------- */

const noiseLast = [
  hn(47318650, "The hidden cost of AI code review: reviewer fatigue", "2026-09-27T13:30:00Z", 203, 166, {
    categories: ["review-noise", "ai-code-review"],
    keywords: ["AI code review", "alert fatigue"],
    mentions: 3,
    excerpt: "After a month with an AI reviewer our engineers had alert fatigue. Every PR had fifteen comments and maybe one mattered.",
  }),
  dev(2971840, "lenaschulz/stop-letting-bots-nitpick-your-pull-requests-4d1a", "Stop letting bots nitpick your pull requests", "2026-09-29T08:00:00Z", 64, 22, {
    categories: ["review-noise"],
    keywords: ["nitpick", "bot comments"],
    excerpt: "If a rule can be auto-fixed, a bot should fix it, not comment on it. Nitpick comments are where reviewer attention goes to die.",
  }),
  so(79903311, "collapse-bot-comments-in-the-github-pull-request-timeline", "Collapse bot comments in the GitHub pull request timeline", "2026-09-30T10:44:00Z", 2, 640, true, {
    categories: ["review-noise"],
    keywords: ["bot comments"],
    excerpt: "Three bots comment on every PR and the human review comments get lost. Can bot comments be collapsed or moved to a check summary?",
  }),
];

const flakyLast = [
  hn(47322094, "Flaky tests are a management problem", "2026-09-28T07:12:00Z", 221, 190, {
    categories: ["ci-cd"],
    keywords: ["flaky test"],
    mentions: 4,
    excerpt: "Teams tolerate flaky tests because nobody is measured on CI health. The fix is ownership, not another retry plugin.",
  }),
  so(79905127, "tests-pass-locally-but-fail-intermittently-on-github-actions", "Tests pass locally but fail intermittently on GitHub Actions", "2026-09-25T15:33:00Z", 3, 1820, true, {
    categories: ["ci-cd"],
    keywords: ["GitHub Actions", "flaky test"],
    excerpt:
      "Our Jest suite passes locally every time but fails on GitHub Actions roughly every fifth run, with a timeout in a different test each time.",
  }),
  so(79910882, "required-status-check-stuck-at-waiting-for-status-to-be-reported", "Required status check stuck at 'Waiting for status to be reported'", "2026-09-30T12:05:00Z", 2, 960, true, {
    categories: ["ci-cd"],
    keywords: ["status check", "GitHub Actions"],
    excerpt:
      "After renaming a workflow job, the required status check never reports and the PR cannot be merged. The branch protection rule still lists the old job name.",
  }),
  dev(2974410, "qa_rahul/we-deleted-300-flaky-tests-5h2c", "We deleted 300 flaky tests. Here's what happened", "2026-09-26T09:00:00Z", 156, 44, {
    categories: ["ci-cd"],
    keywords: ["flaky test"],
    excerpt: "Coverage dropped 4% and nothing bad happened. CI time fell by a third and people started trusting red builds again.",
  }),
  hn(47331577, "GitHub Actions runners stuck in queued state", "2026-09-29T17:48:00Z", 167, 96, {
    categories: ["ci-cd"],
    keywords: ["GitHub Actions", "CI/CD"],
    mentions: 2,
    excerpt: "Jobs sat in queued for 40 minutes this afternoon. The status page said degraded performance; our release was blocked.",
  }),
];

const aiVolumeLast = [
  hn(47327811, "AI-generated code is changing what code review means", "2026-09-28T19:30:00Z", 245, 201, {
    categories: ["ai-code-review"],
    keywords: ["AI-generated code", "code review"],
    mentions: 5,
    excerpt: "Review used to catch mistakes in code a colleague thought hard about. Now it is the first time anyone reads the code at all.",
  }),
  dev(2972905, "mobile_matt/how-we-review-copilot-written-code-2a8f", "How we review Copilot-written code", "2026-09-27T10:20:00Z", 71, 18, {
    categories: ["ai-code-review"],
    keywords: ["AI-generated code", "PR review"],
    excerpt: "We label PRs with the share of AI-written lines and assign a second reviewer above 50%.",
  }),
];

const reviewWaitLast = [
  hn(47320416, "Ask HN: PRs wait 3 days for review at my company. How do I fix this as an IC?", "2026-09-27T21:02:00Z", 189, 211, {
    categories: ["review-speed"],
    keywords: ["waiting for review", "code review"],
    mentions: 4,
    excerpt:
      "My PRs sit for three days waiting for review. When they finally get reviewed I have moved on, and the context switch costs me another day.",
  }),
  dev(2973318, "flowmetrics/the-real-cost-of-waiting-for-code-review-1c7e", "The real cost of waiting for code review", "2026-09-28T06:45:00Z", 83, 20, {
    categories: ["review-speed"],
    keywords: ["waiting for review", "review bottleneck"],
    excerpt: "In our data, time waiting for the first review was 70% of lead time. Coding was 15%.",
  }),
  so(79906734, "auto-assign-reviewers-by-codeowners-and-current-load", "Auto-assign reviewers by CODEOWNERS and current load in GitHub", "2026-09-26T11:30:00Z", 1, 530, false, {
    categories: ["review-speed", "code-review-general"],
    keywords: ["PR review", "pull request"],
    excerpt:
      "CODEOWNERS always requests the same two people. Is there a way to balance review requests by how many open reviews each person has?",
  }),
  hn(47329905, "Stacked diffs, one year in", "2026-09-29T14:00:00Z", 144, 102, {
    categories: ["review-speed"],
    keywords: ["stacked diff", "stacked PR"],
    mentions: 2,
    excerpt: "Stacked diffs changed how we work: reviews are smaller and faster, but the tooling around rebasing a stack is still fragile.",
  }),
  dev(2975521, "teamlead_sam/review-slas-did-they-work-for-us-3e9b", "Review SLAs: did they work for us?", "2026-09-30T08:30:00Z", 52, 17, {
    categories: ["review-speed"],
    keywords: ["waiting for review"],
    excerpt: "A 24-hour review SLA cut waiting time in half, but reviews got shallower. We now track both.",
  }),
  so(79909012, "gitlab-merge-request-approvals-stuck-when-approver-is-on-leave", "GitLab merge request approvals stuck when the approver is on leave", "2026-10-01T09:55:00Z", 1, 288, true, {
    categories: ["review-speed", "code-review-general"],
    keywords: ["merge request"],
    excerpt:
      "Our approval rule requires a specific person who is on leave for two weeks. Can a maintainer override the rule for a single merge request?",
  }),
];

/* ----------------------------- Stats (what the pipeline's code computes) ----------------------------- */

function category(slug: string, name: string, mentions: Four, threads: Four, verified: CategoryStat["verified"]): CategoryStat {
  return { slug, name, mentions, threads, change: change(threads[3], threads[2]), verified };
}

function keyword(kw: string, cat: string, mentions: Four): KeywordStat {
  return { keyword: kw, category: cat, mentions, change: change(mentions[3], mentions[2]) };
}

const categories: CategoryStat[] = [
  category("ci-cd", "CI/CD pipelines & integrations", [58, 63, 66, 70], [41, 44, 46, 49], { checked: 20, relevant: 17 }),
  category("ai-code-review", "AI-generated code & AI reviewers", [38, 45, 52, 71], [22, 27, 31, 44], { checked: 30, relevant: 26 }),
  category("code-review-general", "Code review (general)", [44, 46, 41, 43], [30, 31, 29, 30], { checked: 12, relevant: 9 }),
  category("review-noise", "Noise & false positives", [9, 12, 14, 24], [6, 8, 9, 15], { checked: 15, relevant: 13 }),
  category("static-analysis", "Static analysis & quality gates", [19, 20, 18, 19], [14, 15, 13, 14], { checked: 10, relevant: 8 }),
  category("review-speed", "Review speed & PR bottlenecks", [17, 19, 23, 18], [12, 14, 16, 13], { checked: 13, relevant: 12 }),
  category("review-culture", "Review culture & team practices", [15, 13, 16, 9], [11, 10, 12, 7], { checked: 7, relevant: 5 }),
];

const keywords: KeywordStat[] = [
  keyword("GitHub Actions", "ci-cd", [31, 34, 33, 36]),
  keyword("AI code review", "ai-code-review", [12, 15, 17, 26]),
  keyword("code review", "code-review-general", [24, 25, 22, 23]),
  keyword("pull request", "code-review-general", [18, 19, 17, 18]),
  keyword("AI-generated code", "ai-code-review", [9, 11, 13, 17]),
  keyword("false positive rate", "review-noise", [2, 3, 4, 14]),
  keyword("flaky test", "ci-cd", [7, 9, 8, 12]),
  keyword("CodeRabbit", "ai-code-review", [4, 5, 7, 11]),
  keyword("false positive", "review-noise", [5, 6, 7, 10]),
  keyword("CI/CD", "ci-cd", [11, 12, 13, 10]),
  keyword("merge queue", "review-speed", [3, 4, 6, 7]),
  keyword("ESLint", "static-analysis", [8, 7, 6, 7]),
  keyword("SonarQube", "static-analysis", [4, 5, 5, 6]),
  keyword("stacked PR", "review-speed", [2, 3, 5, 6]),
  keyword("vibe coding", "ai-code-review", [6, 7, 8, 6]),
  keyword("GitLab CI", "ci-cd", [5, 6, 5, 6]),
  keyword("Copilot code review", "ai-code-review", [1, 2, 3, 5]),
  keyword("static analysis", "static-analysis", [6, 6, 6, 5]),
  keyword("Greptile", "ai-code-review", [0, 0, 0, 4]),
  keyword("slow CI", "ci-cd", [3, 4, 4, 4]),
  keyword("LGTM", "review-culture", [5, 4, 6, 3]),
  keyword("Jenkins", "ci-cd", [4, 3, 4, 3]),
  keyword("large PR", "review-speed", [4, 4, 5, 2]),
  keyword("rubber stamp", "review-culture", [3, 3, 4, 2]),
  keyword("pre-commit", "ci-cd", [2, 3, 2, 2]),
  keyword("quality gate", "static-analysis", [1, 2, 1, 2]),
  keyword("too noisy", "review-noise", [0, 1, 1, 2]),
  keyword("signal to noise", "review-noise", [0, 0, 1, 2]),
  keyword("PR review", "code-review-general", [3, 2, 3, 2]),
  keyword("alert fatigue", "review-noise", [1, 0, 1, 1]),
  keyword("trunk-based development", "review-culture", [2, 1, 2, 1]),
];

const thisWeek = [...noise, ...flaky, ...aiVolume, ...reviewWait, ...qualityGates];
const lastWeek = [...noiseLast, ...flakyLast, ...aiVolumeLast, ...reviewWaitLast];
const byKey = (refs: ThreadRef[]) => Object.fromEntries(refs.map((r) => [r.threadKey, r]));
const keys = (refs: ThreadRef[]) => refs.map((r) => r.threadKey);
const ref = (key: string) => {
  const found = thisWeek.find((r) => r.threadKey === key);
  if (!found) throw new Error(`fixture thread ${key} missing`);
  return found;
};

const engagementScore = (r: ThreadRef) =>
  (r.engagement.points ?? 0) + (r.engagement.reactions ?? 0) + (r.engagement.comments ?? 0) + (r.engagement.answers ?? 0) * 5;

const topThreads = [...thisWeek].sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, 6);
const unanswered = thisWeek
  .filter((r) => r.source === "stackoverflow" && !r.engagement.hasAcceptedAnswer)
  .sort((a, b) => (b.engagement.views ?? 0) - (a.engagement.views ?? 0));

function quote(threadKey: string, text: string) {
  if (!ref(threadKey).excerpt.includes(text)) throw new Error(`fixture quote is not verbatim: ${text}`);
  return { threadKey, text };
}

/* ----------------------------- The brief ----------------------------- */

export const sampleBrief: BriefRecord = {
  id: "e3b0c442-98fc-4c14-9afb-f4c8996fb924",
  weekEnd: WEEK_END,
  weekStart: "2026-10-02",
  status: "complete",
  trigger: "cron",
  generatedAt: "2026-10-09T01:32:31.000Z",
  stats: {
    timezone: "Asia/Kolkata",
    weeks,
    totals: { mentions: [212, 238, 251, 289], threads: [131, 142, 149, 171] },
    sources: [
      { source: "hackernews", name: "Hacker News", mentions: [120, 131, 140, 166], threads: [58, 61, 66, 79] },
      { source: "stackoverflow", name: "Stack Overflow", mentions: [41, 47, 44, 48], threads: [41, 47, 44, 48] },
      { source: "devto", name: "DEV Community", mentions: [51, 60, 67, 75], threads: [32, 34, 39, 44] },
    ],
    categories,
    keywords,
    topThreads,
    unanswered,
  },
  analysis: {
    headline:
      "Developers are losing patience with AI reviewers that bury real bugs under nitpicks, while flaky GitHub Actions runs remain the most common day-to-day blocker.",
    painPoints: [
      {
        id: "ai-reviewer-noise",
        title: "AI reviewers flood pull requests with low-value comments and false positives",
        category: "review-noise",
        summary:
          "Teams that switched on AI review bots report that most comments are style nitpicks or repeats of dismissed findings. Engineers stop reading the bot, so the rare real bug it catches gets missed. Workarounds are blunt: limiting bots to large PRs or excluding whole directories.",
        thisWeek: keys(noise),
        lastWeek: keys(noiseLast),
        change: change(noise.length, noiseLast.length),
        unresolved: true,
        quote: quote(
          "hackernews:47391204",
          "people stopped reading its comments after two weeks, and then they started missing the one real issue it flagged",
        ),
      },
      {
        id: "flaky-ci",
        title: "Flaky tests and runner instability on GitHub Actions block merges",
        category: "ci-cd",
        summary:
          "Intermittent runner shutdowns, cache misses and flaky tests force whole-workflow re-runs. The cost is trust as much as time: when red builds are usually noise, real failures slip through. Quarantine setups exist but are home-grown scripts nobody owns.",
        thisWeek: keys(flaky),
        lastWeek: keys(flakyLast),
        change: change(flaky.length, flakyLast.length),
        unresolved: true,
        quote: quote("hackernews:47389012", "When CI is flaky people stop trusting red builds, and that is when real failures get merged."),
      },
      {
        id: "ai-code-volume",
        title: "AI-generated code volume outpaces human review capacity",
        category: "ai-code-review",
        summary:
          "Coding agents are doubling pull-request volume, often as very large diffs. The few senior reviewers for critical code become the bottleneck and approvals turn into rubber stamps. Teams are improvising size limits and intent write-ups.",
        thisWeek: keys(aiVolume),
        lastWeek: keys(aiVolumeLast),
        change: change(aiVolume.length, aiVolumeLast.length),
        unresolved: true,
        quote: quote(
          "hackernews:47396930",
          "The two seniors who can review the payments code are underwater and approval quality is dropping.",
        ),
      },
      {
        id: "review-wait",
        title: "Pull requests wait days for a first review",
        category: "review-speed",
        summary:
          "Time to first review is still the biggest share of lead time, but this week's threads mostly share fixes that work: review rotations, merge queues and small stacked PRs.",
        thisWeek: keys(reviewWait),
        lastWeek: keys(reviewWaitLast),
        change: change(reviewWait.length, reviewWaitLast.length),
        unresolved: false,
        quote: quote("devto:2984990", "Small stacked PRs get reviewed the same day."),
      },
      {
        id: "quality-gate-config",
        title: "Quality-gate rules are hard to tune per repository",
        category: "static-analysis",
        summary:
          "One global quality gate does not fit every team, and exclusions for generated code do not apply consistently. Teams either ignore the gate or spend time fighting it.",
        thisWeek: keys(qualityGates),
        lastWeek: [],
        change: change(qualityGates.length, 0),
        unresolved: true,
        quote: quote("devto:2986544", "Teams either ignore it or spend a sprint fighting it."),
      },
    ],
    underserved: [
      {
        problem: "Teaching AI reviewers what a team considers noise",
        whyUnderserved:
          "Teams mute bots wholesale or maintain long config files. None of the tools mentioned learn from comments that were dismissed or resolved as won't fix.",
        toolsMentioned: ["CodeRabbit", "GitHub Copilot", "Reviewbot-lite"],
        opportunity: "Learn from dismissed comments per repository and show a visible noise budget on each pull request.",
        threadKeys: ["hackernews:47402771", "devto:2986120", "stackoverflow:79936517"],
      },
      {
        problem: "Owning flaky-test quarantine",
        whyUnderserved:
          "Workarounds are home-grown scripts that tag, skip and re-run tests; nobody reports a tool that ties flaky failures to the pull requests they block.",
        toolsMentioned: ["GitHub Actions", "pytest-rerunfailures"],
        opportunity: "Separate likely-flaky failures from real regressions right in the pull-request check.",
        threadKeys: ["devto:2983056", "stackoverflow:79933471", "hackernews:47389012"],
      },
      {
        problem: "Reviewing very large AI-generated pull requests",
        whyUnderserved:
          "Reviewers fall back to rubber-stamping; size limits are enforced with ad-hoc Actions and the only guidance is a manual checklist.",
        toolsMentioned: ["GitHub rulesets", "Graphite"],
        opportunity: "Summarize AI-written diffs by intent and split review into reviewable chunks.",
        threadKeys: ["hackernews:47410046", "stackoverflow:79934208", "devto:2985331"],
      },
    ],
    objections: [
      {
        objection: "Another bot will just add more noise to our pull requests.",
        context:
          "Prospects who trialled CodeRabbit or Copilot code review describe turning them off after weeks of nitpicks. Lead with precision and how findings are suppressed, not with how much the tool catches.",
        threadKeys: ["hackernews:47391204", "devto:2984417"],
      },
      {
        objection: "Our bottleneck is reviewer time, not finding bugs.",
        context:
          "With agents doubling PR volume, buyers frame the problem as review capacity. Show time-to-first-review and reviewer load, not just defects found.",
        threadKeys: ["hackernews:47396930", "devto:2988035"],
      },
      {
        objection: "We already get static analysis for free from SonarQube and ESLint.",
        context:
          "Developers see rules-based tools as cheap but rigid. Be ready to show what context-aware review catches that a linter rule cannot, and how it fits existing quality gates.",
        threadKeys: ["devto:2986544", "stackoverflow:79935902"],
      },
    ],
    sprintSuggestions: [
      {
        suggestion: "Ship a high-confidence mode that only comments when it can cite a failing test or a concrete bug",
        rationale:
          "It targets the fastest-rising pain point and the most likely sales objection; a Show HN built around the same idea drew strong interest.",
        painPointIds: ["ai-reviewer-noise"],
      },
      {
        suggestion: "Flag likely-flaky CI failures in the pull-request check summary",
        rationale: "Flaky GitHub Actions runs are the most discussed everyday blocker and no thread names a tool that solves it.",
        painPointIds: ["flaky-ci"],
      },
      {
        suggestion: "Prototype an intent summary for pull requests over 500 lines",
        rationale: "AI-generated PR volume is rising fast and reviewers ask for a better starting point than the raw diff.",
        painPointIds: ["ai-code-volume", "review-wait"],
      },
    ],
    watchlist: [
      {
        signal: "Greptile shows up in threads for the first time this month: a competitor gaining mindshare.",
        threadKeys: ["hackernews:47402771"],
      },
      {
        signal: "Merge queues and stacked PRs are offered as the fix for review waits; buyers may start to expect support for them.",
        threadKeys: ["hackernews:47399208", "devto:2984990"],
      },
      {
        signal: "Quality-gate configuration surfaced as a new pain point; one more week of mentions would make it a trend.",
        threadKeys: ["devto:2986544"],
      },
    ],
    caveats: [
      "Hacker News comment search is capped per keyword; two keywords hit the cap this week, so their counts are a floor.",
      "Stack Overflow is limited to the configured tags; questions outside them are not counted.",
      "Pain-point groupings are the model's judgement. Their counts come from the thread keys it assigned, re-checked by code.",
    ],
    evidence: byKey([...thisWeek, ...lastWeek]),
    mode: "ai",
    model: "gemini-3.6-flash",
  },
  quality: {
    runId: "5f0c2a7e-8a41-4c1b-9d3e-2b7f6c1a9e04",
    durationMs: 151_000,
    sources: [
      {
        source: "hackernews",
        name: "Hacker News",
        ok: true,
        items: 1840,
        requests: 64,
        ms: 21_430,
        error: null,
        notes: ["Stories and comments searched for 50 keywords", "2 keywords hit the 300-hit cap"],
      },
      { source: "stackoverflow", name: "Stack Overflow", ok: true, items: 412, requests: 12, ms: 6_210, error: null, notes: ["Quota remaining: 9,842"] },
      { source: "devto", name: "DEV Community", ok: true, items: 655, requests: 27, ms: 9_880, error: null, notes: [] },
    ],
    matching: { fetched: 2907, matched: 990, droppedNoContext: 143, threads: 538 },
    classification: { candidates: 160, checked: 120, fromCache: 64, relevant: 101, failed: 0, models: ["gemini-3.6-flash"] },
    synthesis: { ok: true, mode: "ai", model: "gemini-3.6-flash", attempts: 1, ms: 18_450, error: null },
    citations: { cited: 64, valid: 61, dropped: 3 },
    caps: [
      { what: "Threads sent to AI classification", kept: 120, dropped: 40 },
      { what: "Hacker News hits per keyword", kept: 300, dropped: 46 },
    ],
    checks: [
      { name: "All sources responded", passed: true, detail: "3 of 3 communities returned data" },
      { name: "Numbers computed by code", passed: true, detail: "Counts and trends come from matched posts, not from the model" },
      { name: "Citations verified", passed: true, detail: "61 of 64 cited threads exist in the right week; 3 dropped" },
      { name: "Quotes are verbatim", passed: true, detail: "5 of 5 quotes found word for word in the source text" },
      { name: "AI relevance check", passed: true, detail: "101 of 120 checked threads judged on-topic (84%)" },
      { name: "Nothing silently truncated", passed: false, detail: "40 lower-engagement threads were not classified (cap 120)" },
    ],
  },
  delivery: {
    channel: "email",
    status: "sent",
    to: ["sumit@example.com"],
    at: "2026-10-09T01:32:39.000Z",
    detail: "Sent with Resend",
  },
};

/* ----------------------------- A week without the AI (fallback mode) ----------------------------- */

/*
 * What Sumit gets when every Gemini model fails: the same deterministic stats, pain points that are
 * simply the busiest monitored categories, open Stack Overflow questions as underserved candidates,
 * rising keywords as the watchlist, and no objections or sprint ideas. Mirrors pipeline/fallback.ts.
 * Threads are the sample threads moved two weeks back so their dates fall inside 18 – 24 Sep.
 */

const FALLBACK_WEEK_END = "2026-09-25";
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const fallbackThreads = thisWeek.map((t) => ({ ...t, postedAt: new Date(Date.parse(t.postedAt) - TWO_WEEKS_MS).toISOString() }));
const fallbackUnanswered = fallbackThreads
  .filter((r) => r.source === "stackoverflow" && !r.engagement.hasAcceptedAnswer)
  .sort((a, b) => (b.engagement.views ?? 0) - (a.engagement.views ?? 0));
const fallbackRising = keywords.filter((k) => k.change.trend === "rising" || k.change.trend === "new").slice(0, 3);
const fallbackPainPoints = categories.slice(0, 4).map((c, i) => ({
  id: `P${i + 1}`,
  title: c.name,
  category: c.slug,
  summary: `Keyword-based: ${c.threads[3]} threads matched this category, against ${c.threads[2]} the week before. Most-mentioned keywords: ${keywords
    .filter((k) => k.category === c.slug)
    .slice(0, 3)
    .map((k) => k.keyword)
    .join(", ")}.`,
  thisWeek: keys(fallbackThreads.filter((t) => t.categories.includes(c.slug))),
  lastWeek: [],
  change: c.change,
  unresolved: false,
  quote: null,
}));
const fallbackCited = new Set([
  ...fallbackPainPoints.flatMap((p) => p.thisWeek),
  ...fallbackUnanswered.slice(0, 3).map((q) => q.threadKey),
]).size;

export const sampleFallbackBrief: BriefRecord = {
  id: "0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f",
  weekEnd: FALLBACK_WEEK_END,
  weekStart: "2026-09-18",
  status: "partial",
  trigger: "cron",
  generatedAt: "2026-09-25T01:33:05.000Z",
  stats: {
    ...sampleBrief.stats,
    weeks: fourWeeks(FALLBACK_WEEK_END),
    categories: categories.map((c) => ({ ...c, verified: null })),
    topThreads: [...fallbackThreads].sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, 6),
    unanswered: fallbackUnanswered,
  },
  analysis: {
    headline: "AI summary unavailable this week: CI/CD and AI-review threads lead the deterministic counts.",
    painPoints: fallbackPainPoints,
    underserved: fallbackUnanswered.slice(0, 3).map((q) => ({
      problem: `Open question: ${q.title}`,
      whyUnderserved: q.engagement.answers ? "Answered on Stack Overflow, but no answer has been accepted yet." : "No answers yet on Stack Overflow.",
      toolsMentioned: [],
      opportunity: "Check whether the product, its docs or a short guide solves this; a good answer is low-cost visibility with exactly this audience.",
      threadKeys: [q.threadKey],
    })),
    objections: [],
    sprintSuggestions: [],
    watchlist: fallbackRising.map((k) => ({
      signal: `"${k.keyword}" is ${k.change.trend === "new" ? "new this week" : "rising"}: ${k.change.current} mentions this week vs ${k.change.previous} last week.`,
      threadKeys: keys(fallbackThreads.filter((t) => t.keywords.includes(k.keyword)).slice(0, 2)),
    })),
    caveats: [
      "The AI summary was unavailable, so pain points are the busiest monitored categories with their keyword-matched threads, not AI-clustered problems.",
      "No AI relevance check ran this week, so a few matched threads may be off-topic.",
    ],
    evidence: byKey(fallbackThreads),
    mode: "fallback",
    model: null,
  },
  quality: {
    ...sampleBrief.quality,
    runId: "7b3c9e21-5d4f-4a8b-9c6e-2f1d0a9b8c7d",
    durationMs: 112_000,
    classification: { candidates: 150, checked: 0, fromCache: 0, relevant: 0, failed: 150, models: [] },
    synthesis: {
      ok: false,
      mode: "fallback",
      model: null,
      attempts: 3,
      ms: 61_200,
      error: "gemini-3.6-flash returned 503 (overloaded), gemini-3-flash-preview timed out after 20 s, gemini-3.5-flash-lite returned 429 (quota)",
    },
    citations: { cited: fallbackCited, valid: fallbackCited, dropped: 0 },
    caps: [{ what: "Hacker News hits per keyword", kept: 300, dropped: 12 }],
    checks: [
      { name: "All sources responded", passed: true, detail: "3 of 3 communities returned data" },
      { name: "Numbers computed by code", passed: true, detail: "Counts and trends come from matched posts, not from the model" },
      { name: "AI summary", passed: false, detail: "All three models failed; the keyword-based fallback brief was published instead" },
      { name: "AI relevance check", passed: false, detail: "Not run: the AI step was unavailable" },
      { name: "Citations verified", passed: true, detail: "Every linked thread comes straight from the collected data" },
    ],
  },
  delivery: { channel: "email", status: "sent", to: ["sumit@example.com"], at: "2026-09-25T01:33:12.000Z", detail: "Sent with Resend" },
};

/* ----------------------------- Archive + run log ----------------------------- */

function summaryOf(brief: BriefRecord): BriefSummary {
  return {
    id: brief.id,
    weekEnd: brief.weekEnd,
    weekStart: brief.weekStart,
    status: brief.status,
    trigger: brief.trigger,
    generatedAt: brief.generatedAt,
    headline: brief.analysis?.headline ?? null,
    mode: brief.analysis?.mode ?? null,
    topPainPoint: brief.analysis?.painPoints[0]?.title ?? null,
    threadsThisWeek: brief.stats.totals.threads[3],
  };
}

export const sampleBriefSummaries: BriefSummary[] = [
  summaryOf(sampleBrief),
  {
    id: "b7d1f0a2-3c4e-4f59-8a6b-0c1d2e3f4a5b",
    weekEnd: "2026-10-02",
    weekStart: "2026-09-25",
    status: "partial",
    trigger: "manual",
    generatedAt: "2026-10-05T09:16:21.000Z",
    headline: "Flaky GitHub Actions runs dominate CI talk, while long waits for a first review start to ease.",
    mode: "ai",
    topPainPoint: "Pull requests wait days for a first review",
    threadsThisWeek: 149,
  },
  summaryOf(sampleFallbackBrief),
];

const ok = (name: string, ms: number, detail: string) => ({ name, status: "ok" as const, ms, detail });

export const sampleRuns: RunRecord[] = [
  {
    id: "5f0c2a7e-8a41-4c1b-9d3e-2b7f6c1a9e04",
    trigger: "cron",
    weekEnd: "2026-10-09",
    status: "complete",
    startedAt: "2026-10-09T01:30:09.000Z",
    finishedAt: "2026-10-09T01:32:40.000Z",
    steps: [
      ok("Load config", 412, "7 categories, 50 keywords, 22 context terms, 3 sources"),
      ok("Collect", 21_480, "2,907 posts from 3 of 3 sources"),
      ok("Match", 96, "990 matching posts in 538 threads; 143 dropped without a context term"),
      ok("Store", 1_840, "990 mentions upserted"),
      ok("Count", 38, "171 threads this week (+22 vs last week)"),
      ok("Classify", 52_310, "120 threads checked (64 from cache), 101 relevant"),
      ok("Synthesize", 18_450, "gemini-3.6-flash, 1 attempt"),
      ok("Validate", 12, "61 of 64 citations valid, 5 of 5 quotes verbatim"),
      ok("Save", 620, "Brief saved as complete"),
      ok("Deliver", 1_210, "Emailed 1 recipient"),
    ],
    error: null,
    briefId: sampleBrief.id,
  },
  {
    id: "c41d7b52-0e9a-4f6b-8a27-91d3e5f0b6a8",
    trigger: "manual",
    weekEnd: "2026-10-02",
    status: "partial",
    startedAt: "2026-10-05T09:14:03.000Z",
    finishedAt: "2026-10-05T09:16:21.000Z",
    steps: [
      ok("Load config", 388, "7 categories, 50 keywords, 22 context terms, 3 sources"),
      { name: "Collect", status: "warning", ms: 30_020, detail: "DEV Community timed out after 1 retry; 2 of 3 sources returned data" },
      ok("Match", 81, "861 matching posts in 470 threads"),
      ok("Store", 1_530, "861 mentions upserted"),
      ok("Count", 31, "149 threads this week"),
      ok("Classify", 47_900, "112 threads checked (58 from cache), 93 relevant"),
      ok("Synthesize", 21_270, "gemini-3.6-flash, 2 attempts (first returned invalid JSON)"),
      ok("Validate", 10, "52 of 55 citations valid"),
      ok("Save", 540, "Brief saved as partial (1 source missing)"),
      { name: "Deliver", status: "skipped", ms: null, detail: "Manual re-run: published on the web only" },
    ],
    error: null,
    briefId: "b7d1f0a2-3c4e-4f59-8a6b-0c1d2e3f4a5b",
  },
  {
    id: "9a7e3c10-6d52-4b8f-a1c4-7e2f0d9b3c65",
    trigger: "cron",
    weekEnd: "2026-10-02",
    status: "failed",
    startedAt: "2026-10-02T01:30:11.000Z",
    finishedAt: "2026-10-02T01:31:02.000Z",
    steps: [
      ok("Load config", 455, "7 categories, 50 keywords, 22 context terms, 3 sources"),
      ok("Collect", 24_110, "2,644 posts from 3 of 3 sources"),
      ok("Match", 88, "874 matching posts in 481 threads"),
      { name: "Store", status: "failed", ms: 25_000, detail: "Supabase pipeline_upsert_mentions failed: upstream request timeout" },
      { name: "Count", status: "skipped", ms: null, detail: "Not run after a failed step" },
    ],
    error: "Store: Supabase pipeline_upsert_mentions failed: upstream request timeout",
    briefId: null,
  },
];
