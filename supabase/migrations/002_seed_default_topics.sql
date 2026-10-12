-- Starting topic taxonomy for a code-review automation product. Sumit edits these rows in the Table Editor.
insert into public.topic_categories (slug, name, description, sort_order) values
  ('review-noise', 'Noise & false positives',
   'Automated review tools, bots, linters or scanners that flag non-issues, nitpick, or bury real problems in noise; the resulting alert fatigue and loss of trust in automated feedback.', 10),
  ('ai-code-review', 'AI-generated code & AI reviewers',
   'The flood of AI-written code that humans must review, and AI review assistants (Copilot code review, CodeRabbit, Greptile, etc.): accuracy, trust, cost and workflow fit.', 20),
  ('review-speed', 'Review speed & PR bottlenecks',
   'Pull requests waiting on reviewers, slow or blocked merges, oversized PRs, stacked PRs and merge queues: anything that makes the review step slow down shipping.', 30),
  ('review-culture', 'Review culture & team practices',
   'How teams actually do code review: rubber-stamp approvals, skipped reviews in fast-moving teams, ownership and etiquette, and arguments for or against code review itself.', 40),
  ('ci-cd', 'CI/CD pipelines & integrations',
   'Wiring checks into CI/CD: GitHub Actions and GitLab CI setup, slow or flaky pipelines, required status checks, and integration headaches.', 50),
  ('static-analysis', 'Static analysis & quality gates',
   'Linters, SAST and static analysis tools, quality gates and coverage rules enforced on pull requests: setup pain, configuration and rule tuning.', 60),
  ('code-review-general', 'Code review (general)',
   'General discussion of code review and pull requests that does not fit a more specific category.', 90);

insert into public.topic_keywords (category_id, keyword, requires_context)
select c.id, k.keyword, k.requires_context
from (values
  ('review-noise', 'false positive', true),
  ('review-noise', 'false positive rate', true),
  ('review-noise', 'nitpick', true),
  ('review-noise', 'too noisy', true),
  ('review-noise', 'alert fatigue', true),
  ('review-noise', 'signal to noise', true),
  ('review-noise', 'bot comments', true),
  ('ai-code-review', 'AI code review', false),
  ('ai-code-review', 'AI reviewer', false),
  ('ai-code-review', 'AI-generated code', false),
  ('ai-code-review', 'Copilot code review', false),
  ('ai-code-review', 'CodeRabbit', false),
  ('ai-code-review', 'Greptile', false),
  ('ai-code-review', 'vibe coding', true),
  ('ai-code-review', 'AI slop', true),
  ('review-speed', 'waiting for review', true),
  ('review-speed', 'review bottleneck', true),
  ('review-speed', 'slow review', true),
  ('review-speed', 'stacked PR', false),
  ('review-speed', 'stacked diff', false),
  ('review-speed', 'merge queue', false),
  ('review-speed', 'large PR', false),
  ('review-speed', 'PR size', false),
  ('review-culture', 'review culture', true),
  ('review-culture', 'rubber stamp', true),
  ('review-culture', 'LGTM', false),
  ('review-culture', 'without code review', false),
  ('review-culture', 'pair programming', true),
  ('review-culture', 'trunk-based development', false),
  ('ci-cd', 'GitHub Actions', false),
  ('ci-cd', 'GitLab CI', false),
  ('ci-cd', 'CI/CD', false),
  ('ci-cd', 'CI pipeline', false),
  ('ci-cd', 'flaky test', false),
  ('ci-cd', 'slow CI', false),
  ('ci-cd', 'status check', true),
  ('ci-cd', 'pre-commit', false),
  ('ci-cd', 'Jenkins', true),
  ('static-analysis', 'static analysis', false),
  ('static-analysis', 'linter', false),
  ('static-analysis', 'SonarQube', false),
  ('static-analysis', 'SAST', true),
  ('static-analysis', 'quality gate', true),
  ('static-analysis', 'ESLint', false),
  ('static-analysis', 'Semgrep', false),
  ('static-analysis', 'code quality', true),
  ('code-review-general', 'code review', false),
  ('code-review-general', 'pull request', false),
  ('code-review-general', 'PR review', false),
  ('code-review-general', 'merge request', false)
) as k(category_slug, keyword, requires_context)
join public.topic_categories c on c.slug = k.category_slug;

insert into public.context_terms (term) values
  ('code review'), ('pull request'), ('PR'), ('merge request'), ('reviewer'), ('linter'), ('lint'),
  ('static analysis'), ('CI'), ('CI/CD'), ('pipeline'), ('GitHub'), ('GitLab'), ('Bitbucket'),
  ('SonarQube'), ('Copilot'), ('CodeRabbit'), ('commit'), ('codebase'), ('repo'), ('pre-commit'), ('test suite');

insert into public.community_sources (slug, name, config) values
  ('hackernews', 'Hacker News', '{"include_comments": true}'::jsonb),
  ('stackoverflow', 'Stack Overflow',
   '{"tags": ["github-actions", "gitlab-ci", "continuous-integration", "pull-request", "code-review", "sonarqube", "eslint", "pre-commit-hook", "jenkins-pipeline", "azure-pipelines"]}'::jsonb),
  ('devto', 'DEV Community',
   '{"tags": ["codereview", "cicd", "devops", "github", "githubactions", "git", "testing", "productivity", "discuss"]}'::jsonb);
