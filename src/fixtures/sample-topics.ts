import type { TopicConfigView } from "@/lib/data";

/*
 * The seeded topic configuration (supabase/migrations/002_seed_default_topics.sql) in the shape
 * getTopicConfig() returns, for local UI work with PULSE_FIXTURE=1. One keyword is paused so the
 * inactive state has something to render.
 */

const UPDATED = "2026-10-12T06:07:35.386Z";

type Kw = [keyword: string, requiresContext: boolean, isActive?: boolean];

function cat(id: string, slug: string, name: string, description: string, sortOrder: number, kws: Kw[]) {
  return {
    id,
    slug,
    name,
    description,
    isActive: true,
    sortOrder,
    updatedAt: UPDATED,
    keywords: kws.map(([keyword, requiresContext, isActive = true]) => ({ keyword, requiresContext, isActive })),
  };
}

export const sampleTopicConfig: TopicConfigView = {
  categories: [
    cat(
      "6d1c0f1e-0001-4000-8000-000000000001",
      "review-noise",
      "Noise & false positives",
      "Automated review tools, bots, linters or scanners that flag non-issues, nitpick, or bury real problems in noise; the resulting alert fatigue and loss of trust in automated feedback.",
      10,
      [
        ["alert fatigue", true],
        ["bot comments", true],
        ["false positive", true],
        ["false positive rate", true],
        ["nitpick", true],
        ["signal to noise", true],
        ["too noisy", true],
      ],
    ),
    cat(
      "6d1c0f1e-0002-4000-8000-000000000002",
      "ai-code-review",
      "AI-generated code & AI reviewers",
      "The flood of AI-written code that humans must review, and AI review assistants (Copilot code review, CodeRabbit, Greptile, etc.): accuracy, trust, cost and workflow fit.",
      20,
      [
        ["AI code review", false],
        ["AI reviewer", false],
        ["AI slop", true],
        ["AI-generated code", false],
        ["CodeRabbit", false],
        ["Copilot code review", false],
        ["Greptile", false],
        ["vibe coding", true],
      ],
    ),
    cat(
      "6d1c0f1e-0003-4000-8000-000000000003",
      "review-speed",
      "Review speed & PR bottlenecks",
      "Pull requests waiting on reviewers, slow or blocked merges, oversized PRs, stacked PRs and merge queues: anything that makes the review step slow down shipping.",
      30,
      [
        ["large PR", false],
        ["merge queue", false],
        ["PR size", false],
        ["review bottleneck", true],
        ["slow review", true],
        ["stacked diff", false],
        ["stacked PR", false],
        ["waiting for review", true],
      ],
    ),
    cat(
      "6d1c0f1e-0004-4000-8000-000000000004",
      "review-culture",
      "Review culture & team practices",
      "How teams actually do code review: rubber-stamp approvals, skipped reviews in fast-moving teams, ownership and etiquette, and arguments for or against code review itself.",
      40,
      [
        ["LGTM", false],
        ["pair programming", true],
        ["review culture", true],
        ["rubber stamp", true],
        ["trunk-based development", false],
        ["without code review", false],
      ],
    ),
    cat(
      "6d1c0f1e-0005-4000-8000-000000000005",
      "ci-cd",
      "CI/CD pipelines & integrations",
      "Wiring checks into CI/CD: GitHub Actions and GitLab CI setup, slow or flaky pipelines, required status checks, and integration headaches.",
      50,
      [
        ["CI pipeline", false],
        ["CI/CD", false],
        ["flaky test", false],
        ["GitHub Actions", false],
        ["GitLab CI", false],
        ["pre-commit", false],
        ["slow CI", false],
        ["status check", true],
        ["Jenkins", true, false],
      ],
    ),
    cat(
      "6d1c0f1e-0006-4000-8000-000000000006",
      "static-analysis",
      "Static analysis & quality gates",
      "Linters, SAST and static analysis tools, quality gates and coverage rules enforced on pull requests: setup pain, configuration and rule tuning.",
      60,
      [
        ["code quality", true],
        ["ESLint", false],
        ["linter", false],
        ["quality gate", true],
        ["SAST", true],
        ["Semgrep", false],
        ["SonarQube", false],
        ["static analysis", false],
      ],
    ),
    cat(
      "6d1c0f1e-0007-4000-8000-000000000007",
      "code-review-general",
      "Code review (general)",
      "General discussion of code review and pull requests that does not fit a more specific category.",
      90,
      [
        ["code review", false],
        ["merge request", false],
        ["PR review", false],
        ["pull request", false],
      ],
    ),
  ],
  contextTerms: [
    "Bitbucket", "CI", "CI/CD", "code review", "codebase", "CodeRabbit", "commit", "Copilot", "GitHub", "GitLab", "lint",
    "linter", "merge request", "pipeline", "PR", "pre-commit", "pull request", "repo", "reviewer", "SonarQube",
    "static analysis", "test suite",
  ].map((term) => ({ term, isActive: true })),
  sources: [
    { slug: "hackernews", name: "Hacker News", isActive: true, tags: [], includeComments: true, configIssue: null, updatedAt: UPDATED },
    {
      slug: "stackoverflow",
      name: "Stack Overflow",
      isActive: true,
      tags: [
        "github-actions", "gitlab-ci", "continuous-integration", "pull-request", "code-review", "sonarqube", "eslint",
        "pre-commit-hook", "jenkins-pipeline", "azure-pipelines",
      ],
      includeComments: false,
      configIssue: null,
      updatedAt: UPDATED,
    },
    {
      slug: "devto",
      name: "DEV Community",
      isActive: true,
      tags: ["codereview", "cicd", "devops", "github", "githubactions", "git", "testing", "productivity", "discuss"],
      includeComments: false,
      configIssue: null,
      updatedAt: UPDATED,
    },
  ],
  lastUpdated: UPDATED,
};
