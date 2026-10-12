import type { PulseConfig, TopicCategory } from "../../contracts";

/* The default topic taxonomy from supabase/migrations/002_seed_default_topics.sql, as loadConfig() returns it. */

function category(
  slug: string,
  name: string,
  description: string,
  sortOrder: number,
  keywords: [keyword: string, requiresContext: boolean][],
): TopicCategory {
  return {
    id: `cat-${slug}`,
    slug,
    name,
    description,
    sortOrder,
    keywords: keywords.map(([keyword, requiresContext]) => ({ keyword, requiresContext })),
  };
}

export const testConfig: PulseConfig = {
  categories: [
    category(
      "review-noise",
      "Noise & false positives",
      "Automated review tools, bots, linters or scanners that flag non-issues, nitpick, or bury real problems in noise; the resulting alert fatigue and loss of trust in automated feedback.",
      10,
      [
        ["false positive", true],
        ["false positive rate", true],
        ["nitpick", true],
        ["too noisy", true],
        ["alert fatigue", true],
        ["signal to noise", true],
        ["bot comments", true],
      ],
    ),
    category(
      "ai-code-review",
      "AI-generated code & AI reviewers",
      "The flood of AI-written code that humans must review, and AI review assistants (Copilot code review, CodeRabbit, Greptile, etc.): accuracy, trust, cost and workflow fit.",
      20,
      [
        ["AI code review", false],
        ["AI reviewer", false],
        ["AI-generated code", false],
        ["Copilot code review", false],
        ["CodeRabbit", false],
        ["Greptile", false],
        ["vibe coding", true],
        ["AI slop", true],
      ],
    ),
    category(
      "review-speed",
      "Review speed & PR bottlenecks",
      "Pull requests waiting on reviewers, slow or blocked merges, oversized PRs, stacked PRs and merge queues: anything that makes the review step slow down shipping.",
      30,
      [
        ["waiting for review", true],
        ["review bottleneck", true],
        ["slow review", true],
        ["stacked PR", false],
        ["merge queue", false],
        ["large PR", false],
        ["PR size", false],
      ],
    ),
    category(
      "review-culture",
      "Review culture & team practices",
      "How teams actually do code review: rubber-stamp approvals, skipped reviews in fast-moving teams, ownership and etiquette, and arguments for or against code review itself.",
      40,
      [
        ["review culture", true],
        ["rubber stamp", true],
        ["LGTM", false],
        ["without code review", false],
        ["pair programming", true],
        ["trunk-based development", false],
      ],
    ),
    category(
      "ci-cd",
      "CI/CD pipelines & integrations",
      "Wiring checks into CI/CD: GitHub Actions and GitLab CI setup, slow or flaky pipelines, required status checks, and integration headaches.",
      50,
      [
        ["GitHub Actions", false],
        ["GitLab CI", false],
        ["CI/CD", false],
        ["CI pipeline", false],
        ["flaky test", false],
        ["slow CI", false],
        ["status check", true],
        ["pre-commit", false],
        ["Jenkins", true],
      ],
    ),
    category(
      "static-analysis",
      "Static analysis & quality gates",
      "Linters, SAST and static analysis tools, quality gates and coverage rules enforced on pull requests: setup pain, configuration and rule tuning.",
      60,
      [
        ["static analysis", false],
        ["linter", false],
        ["SonarQube", false],
        ["SAST", true],
        ["quality gate", true],
        ["ESLint", false],
        ["Semgrep", false],
      ],
    ),
    category(
      "code-review-general",
      "Code review (general)",
      "General discussion of code review and pull requests that does not fit a more specific category.",
      90,
      [
        ["code review", false],
        ["pull request", false],
        ["PR review", false],
        ["merge request", false],
      ],
    ),
  ],
  contextTerms: ["code review", "pull request", "PR", "reviewer", "linter", "CI", "pipeline", "GitHub", "GitLab"],
  sources: [
    { slug: "hackernews", name: "Hacker News", isActive: true, tags: [], includeComments: true },
    { slug: "stackoverflow", name: "Stack Overflow", isActive: true, tags: ["github-actions", "gitlab-ci"], includeComments: false },
    { slug: "devto", name: "DEV Community", isActive: true, tags: ["codereview", "cicd"], includeComments: false },
  ],
  configHash: "fixture-config-v1",
};
