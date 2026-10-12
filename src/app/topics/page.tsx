import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SourceGlyph } from "@/components/brief/evidence";
import { ActiveBadge } from "@/components/ui/badges";
import { cx } from "@/components/ui/cx";
import { AlertIcon, ContextIcon } from "@/components/ui/icons";
import { PageIntro } from "@/components/ui/layout";
import { Callout, EmptyNote, ErrorBox, Skeleton } from "@/components/ui/notices";
import { getTopicConfig, settle, type TopicConfigView, type TopicKeywordView } from "@/lib/data";
import { formatCount, formatIstDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Topics",
  description: "The live topic configuration: monitored categories, keywords, context terms and communities, read from Supabase.",
};

export default function TopicsPage() {
  return (
    <div className="space-y-10">
      <PageIntro kicker="Topic configuration" title="What the pipeline listens for">
        The categories, keywords, context terms and communities the next run will use, read live from Supabase.
      </PageIntro>
      <Callout title="Change topics without touching code">
        Sumit edits these rows in the Supabase Table Editor (<code className="font-mono text-[0.8125rem]">topic_categories</code>,{" "}
        <code className="font-mono text-[0.8125rem]">topic_keywords</code>, <code className="font-mono text-[0.8125rem]">context_terms</code>{" "}
        and <code className="font-mono text-[0.8125rem]">community_sources</code>) and the next run picks them up — no code change, no
        redeploy. Switching a row’s <code className="font-mono text-[0.8125rem]">is_active</code> off pauses it without losing its history.
      </Callout>
      <Suspense fallback={<TopicsSkeleton />}>
        <TopicConfig />
      </Suspense>
    </div>
  );
}

async function TopicConfig() {
  const result = await settle(getTopicConfig());
  if (!result.ok) return <ErrorBox title="The topic configuration could not be loaded" kind={result.error.kind} message={result.error.message} />;
  return <ConfigOverview config={result.data} />;
}

function ConfigOverview({ config }: { config: TopicConfigView }) {
  const activeCategories = config.categories.filter((c) => c.isActive);
  const keywords = activeCategories.flatMap((c) => c.keywords);
  const activeKeywords = keywords.filter((k) => k.isActive);
  const contextual = activeKeywords.filter((k) => k.requiresContext);
  const activeTerms = config.contextTerms.filter((t) => t.isActive);
  const activeSources = config.sources.filter((s) => s.isActive);
  const examples = contextual.slice(0, 3).map((k) => `“${k.keyword}”`);

  return (
    <div className="space-y-14">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-5">
        <Stat label="Active categories" value={`${activeCategories.length}`} hint={`of ${config.categories.length}`} />
        <Stat label="Active keywords" value={formatCount(activeKeywords.length)} hint={`${contextual.length} need context`} />
        <Stat label="Context terms" value={formatCount(activeTerms.length)} hint={`of ${config.contextTerms.length}`} />
        <Stat label="Communities" value={`${activeSources.length}`} hint={`of ${config.sources.length} active`} />
        <Stat
          label="Last updated"
          value={config.lastUpdated ? formatIstDateTime(config.lastUpdated) : "–"}
          hint="Most recent change to any row"
          small
          className="col-span-2 md:col-span-1"
        />
      </dl>

      <section aria-labelledby="categories-title" className="space-y-5">
        <div className="max-w-3xl">
          <h2 id="categories-title" className="font-serif text-[1.75rem] font-medium leading-tight tracking-tight sm:text-3xl">
            Categories and keywords
          </h2>
          <p className="mt-2 text-ink-2">
            A post counts towards a category when it mentions one of its keywords. Matching is case-insensitive, word-boundary safe and
            tolerant of plurals and hyphen/space variants.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-rule-strong bg-surface px-2 py-0.5 text-ink">
              <ContextIcon className="size-3.5 text-accent" />
              needs context
            </span>
            <span>
              Generic phrases{examples.length > 0 ? ` such as ${examples.join(", ")}` : ""} only count when the same post also mentions a
              context term, which keeps medical, security and unrelated threads out of the numbers.
            </span>
          </p>
        </div>
        {config.categories.length === 0 ? (
          <EmptyNote>No categories are configured, so the next run has nothing to look for and will stop with a clear message.</EmptyNote>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {config.categories.map((c) => (
              <li key={c.id} className={cx("card p-5 sm:p-6", !c.isActive && "opacity-75")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-serif text-xl font-medium leading-snug tracking-tight">{c.name}</h3>
                  <ActiveBadge active={c.isActive} title={c.isActive ? "Used by the next run" : "Paused: ignored by the next run"} />
                </div>
                <p className="mt-1.5 text-sm text-ink-2">{c.description}</p>
                <p className="mt-2 text-xs text-ink-3">
                  <code className="font-mono">{c.slug}</code> · {c.keywords.filter((k) => k.isActive).length} of {c.keywords.length} keywords
                  active
                </p>
                {c.keywords.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-3">No keywords yet.</p>
                ) : (
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`Keywords for ${c.name}`}>
                    {c.keywords.map((k) => (
                      <KeywordChip key={k.keyword} keyword={k} />
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="context-title" className="space-y-5">
        <div className="max-w-3xl">
          <h2 id="context-title" className="font-serif text-[1.75rem] font-medium leading-tight tracking-tight sm:text-3xl">
            Context terms
          </h2>
          <p className="mt-2 text-ink-2">
            Proof that a post is about software delivery. A keyword marked “needs context” is only counted when one of these appears in
            the same post.
          </p>
        </div>
        {config.contextTerms.length === 0 ? (
          <EmptyNote>No context terms are configured, so keywords that need context will not be counted at all.</EmptyNote>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {config.contextTerms.map((t) => (
              <li
                key={t.term}
                className={cx(
                  "rounded-md border px-2 py-0.5 text-sm",
                  t.isActive ? "border-rule-strong bg-surface text-ink" : "border-dashed border-rule-strong text-ink-3",
                )}
              >
                {t.term}
                {t.isActive ? null : <span className="ml-1 text-xs">(paused)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sources-title" className="space-y-5">
        <div className="max-w-3xl">
          <h2 id="sources-title" className="font-serif text-[1.75rem] font-medium leading-tight tracking-tight sm:text-3xl">
            Communities
          </h2>
          <p className="mt-2 text-ink-2">
            Public, free APIs only. Tags decide which Stack Overflow questions and DEV articles are read; Hacker News is searched per
            keyword.{" "}
            <Link href="/how-it-works#sources" className="link">
              Why not Reddit?
            </Link>
          </p>
        </div>
        {config.sources.length === 0 ? (
          <EmptyNote>No communities are configured.</EmptyNote>
        ) : (
          <ul className="grid gap-4 md:grid-cols-3">
            {config.sources.map((s) => (
              <li key={s.slug} className={cx("card p-5", !s.isActive && "opacity-75")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-semibold text-ink">
                    <SourceGlyph source={s.slug} />
                    {s.name}
                  </h3>
                  <ActiveBadge active={s.isActive} />
                </div>
                {s.slug === "hackernews" ? (
                  <p className="mt-3 text-sm text-ink-2">
                    Searched for every active keyword: {s.includeComments ? "stories and comments" : "stories only"}.
                  </p>
                ) : s.tags.length > 0 ? (
                  <>
                    <p className="mt-3 text-xs font-medium text-ink-3">Tags read</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.tags.map((tag) => (
                        <li key={tag} className="rounded bg-sunk px-1.5 py-0.5 font-mono text-xs text-ink-2">
                          {tag}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-3">No tags configured, so nothing is read from this community.</p>
                )}
                {s.configIssue ? (
                  <p className="mt-3 flex gap-1.5 text-xs text-bad">
                    <AlertIcon className="mt-px size-3.5" />
                    <span>{s.configIssue}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KeywordChip({ keyword: k }: { keyword: TopicKeywordView }) {
  return (
    <li
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm",
        k.isActive ? "border-rule-strong bg-surface text-ink" : "border-dashed border-rule-strong text-ink-3",
      )}
      title={k.requiresContext ? "Counted only when the same post mentions a context term" : undefined}
    >
      {k.requiresContext ? <ContextIcon className="size-3.5 text-accent" /> : null}
      <span>{k.keyword}</span>
      {k.requiresContext ? <span className="sr-only"> (needs a context term)</span> : null}
      {k.isActive ? null : <span className="text-xs">(paused)</span>}
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
  small = false,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  small?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1 bg-surface p-4 sm:p-5", className)}>
      <dt className="text-sm font-medium text-ink-2">{label}</dt>
      <dd className={cx("font-semibold leading-tight tracking-tight text-ink", small ? "text-lg" : "text-3xl")}>{value}</dd>
      <dd className="text-xs text-ink-3">{hint}</dd>
    </div>
  );
}

function TopicsSkeleton() {
  return (
    <div className="space-y-10">
      <p role="status" className="sr-only">
        Loading the topic configuration…
      </p>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-3 p-5 sm:p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-6 w-20" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
