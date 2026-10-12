import Link from "next/link";
import type { BriefRecord } from "@/lib/contracts";
import { rank } from "@/lib/format";
import { LogoMark } from "@/components/site/site-chrome";
import { ArrowRightIcon, TargetIcon } from "@/components/ui/icons";
import { RAIL_GRID, SectionsWithNav } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/notices";
import { BRIEF_SECTIONS, BriefTop } from "./brief-top";
import { MethodSection } from "./method";
import { ObjectionsSection, SprintSection, UnresolvedSection, WatchlistSection } from "./opportunities";
import { PainPointsSection } from "./pain-points";
import { KeywordsSection, TrendingSection } from "./trends";

/*
 * A whole brief, top to bottom, in the order Sumit reads it on Friday morning. Section ids match
 * BRIEF_SECTIONS, which also drives the sticky "On this page" menu beside the sections.
 */

type SectionId = (typeof BRIEF_SECTIONS)[number]["id"];

const indexOf = (id: SectionId) => rank(BRIEF_SECTIONS.findIndex((s) => s.id === id));

export function BriefView({ brief }: { brief: BriefRecord }) {
  const { stats, analysis } = brief;
  return (
    <article className="space-y-14 sm:space-y-16">
      <BriefTop brief={brief} />
      <SectionsWithNav sections={BRIEF_SECTIONS} label="Sections of this brief">
        <PainPointsSection index={indexOf("pain-points")} analysis={analysis} stats={stats} />
        <TrendingSection index={indexOf("trending")} stats={stats} />
        <KeywordsSection index={indexOf("keywords")} stats={stats} />
        <UnresolvedSection index={indexOf("unresolved")} analysis={analysis} stats={stats} />
        <ObjectionsSection index={indexOf("objections")} analysis={analysis} />
        <SprintSection index={indexOf("sprint")} analysis={analysis} />
        <WatchlistSection index={indexOf("watchlist")} analysis={analysis} />
        <MethodSection index={indexOf("method")} brief={brief} />
      </SectionsWithNav>
    </article>
  );
}

/** Shown on the home page until the first Friday run has saved a brief. */
export function NoBriefYet() {
  return (
    <section aria-labelledby="no-brief-title" className="card mx-auto max-w-2xl px-6 py-10 text-center sm:px-10 sm:py-14">
      <LogoMark className="mx-auto size-12" />
      <p className="kicker mt-6">Weekly brief</p>
      <h1 id="no-brief-title" className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
        No brief yet — the first one is generated Friday 07:00 IST
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-ink-2">
        Every Friday morning the pipeline reads the week’s code review, CI/CD and developer-workflow threads on Hacker News, Stack
        Overflow and DEV, and publishes the brief here.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/how-it-works"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong"
        >
          See how it works
          <ArrowRightIcon className="size-4" />
        </Link>
        <Link
          href="/topics"
          className="inline-flex items-center gap-2 rounded-lg border border-rule-strong px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-sunk"
        >
          <TargetIcon className="size-4 text-ink-3" />
          What it monitors
        </Link>
      </div>
    </section>
  );
}

/** Suspense fallback with the brief's real proportions, so nothing jumps when it streams in. */
export function BriefSkeleton({ label = "Loading the brief…" }: { label?: string }) {
  return (
    <div className="space-y-8 sm:space-y-10">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="space-y-4">
        <Skeleton className="h-3.5 w-56" />
        <Skeleton className="h-12 w-72 max-w-full sm:h-14 sm:w-96" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>
      <div className="space-y-3 border-l-2 border-rule pl-4 sm:pl-6">
        <Skeleton className="h-7 w-full max-w-4xl" />
        <Skeleton className="h-7 w-2/3" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-rule bg-rule min-[400px]:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 bg-surface p-4 sm:p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </div>
      <div className={RAIL_GRID}>
        <div aria-hidden="true" className="hidden space-y-3 xl:block">
          <Skeleton className="h-3 w-24" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-4 w-32" />
          ))}
        </div>
        <div className="space-y-4 border-t border-rule pt-8">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
