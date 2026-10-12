import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AnalysisModeBadge, Badge, StatusBadge, TriggerBadge } from "@/components/ui/badges";
import { ArrowRightIcon } from "@/components/ui/icons";
import { PageIntro } from "@/components/ui/layout";
import { EmptyNote, ErrorBox, Skeleton } from "@/components/ui/notices";
import { listBriefs, settle, type BriefSummary } from "@/lib/data";
import { formatCount, formatIstDateTime, weekLabel } from "@/lib/format";
import { formatFriday } from "@/lib/weeks";

export const metadata: Metadata = {
  title: "Archive",
  description: "Every weekly Community Pulse brief, newest first: status, headline and top pain point for each Friday.",
};

export default function ArchivePage() {
  return (
    <div className="space-y-10">
      <PageIntro kicker="Archive" title="Every Friday brief">
        One brief per week, Friday 00:00 to Friday 00:00 IST. Re-running a week replaces its brief instead of adding a second one, so each
        row is the latest word on that week.
      </PageIntro>
      <Suspense fallback={<ArchiveSkeleton />}>
        <Archive />
      </Suspense>
    </div>
  );
}

async function Archive() {
  const result = await settle(listBriefs());
  if (!result.ok) return <ErrorBox title="The archive could not be loaded" kind={result.error.kind} message={result.error.message} />;
  if (result.data.length === 0) {
    return (
      <EmptyNote>
        No briefs yet — the first one is generated Friday 07:00 IST.{" "}
        <Link href="/how-it-works" className="link">
          See how it works
        </Link>
        .
      </EmptyNote>
    );
  }
  return (
    <ol className="space-y-4" aria-label="Briefs, newest first">
      {result.data.map((brief, i) => (
        <ArchiveItem key={brief.id} brief={brief} latest={i === 0} />
      ))}
    </ol>
  );
}

function ArchiveItem({ brief, latest }: { brief: BriefSummary; latest: boolean }) {
  return (
    <li className="card group relative grid gap-x-8 gap-y-4 p-5 transition-colors hover:border-rule-strong sm:p-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-3">Week ending {formatFriday(brief.weekEnd)}</p>
        <h2 className="mt-1.5 font-serif text-2xl font-medium leading-tight tracking-tight">
          <Link href={`/briefs/${brief.weekEnd}`} className="rounded after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {weekLabel(brief.weekEnd)}
          </Link>
        </h2>
        {latest ? (
          <Badge tone="accent" className="mt-2">
            Latest
          </Badge>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={brief.status} />
          <AnalysisModeBadge mode={brief.mode} />
          <TriggerBadge trigger={brief.trigger} />
        </div>
        <p className="mt-3 font-serif text-lg leading-snug text-ink sm:text-xl">
          {brief.headline ?? <span className="text-ink-3">No headline was written for this week.</span>}
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <dt className="text-xs text-ink-3">Top pain point</dt>
            <dd className="text-ink-2">{brief.topPainPoint ?? "None identified"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Threads that week</dt>
            <dd className="tabular-nums text-ink-2">{brief.threadsThisWeek === null ? "–" : formatCount(brief.threadsThisWeek)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Generated</dt>
            <dd className="text-ink-2">{formatIstDateTime(brief.generatedAt)}</dd>
          </div>
        </dl>
      </div>
      <ArrowRightIcon className="absolute right-5 top-5 size-5 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:right-6 sm:top-6" />
    </li>
  );
}

function ArchiveSkeleton() {
  return (
    <div className="space-y-4">
      <p role="status" className="sr-only">
        Loading the archive…
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card grid gap-6 p-5 sm:p-6 md:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-7 w-32" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
