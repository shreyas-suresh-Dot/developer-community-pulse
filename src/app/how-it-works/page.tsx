import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataSources, PipelineDiagram, ReliabilityRules } from "@/components/how/how-sections";
import { RunPanel } from "@/components/runs/run-panel";
import { RunsTable } from "@/components/runs/run-steps";
import { PageIntro, Section, SectionsWithNav } from "@/components/ui/layout";
import { EmptyNote, ErrorBox, Skeleton } from "@/components/ui/notices";
import { listRuns, settle } from "@/lib/data";
import { recentWeekEnds, weekLabel } from "@/lib/format";
import { latestWeekEnd } from "@/lib/weeks";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How the weekly brief is made: the pipeline from Vercel Cron to Gemini to Supabase, the reliability rules, the data sources and the live run log.",
};

/** Same order as the numbered sections below; drives the sticky "On this page" menu. */
const SECTIONS = [
  { id: "pipeline", label: "The pipeline" },
  { id: "reliability", label: "Reliability rules" },
  { id: "sources", label: "Data sources" },
  { id: "runs", label: "Recent runs" },
  { id: "run-now", label: "Run it now" },
] as const;

export default function HowItWorksPage() {
  return (
    <div className="space-y-14 sm:space-y-16">
      <PageIntro kicker="How it works" title="From community threads to a Friday brief">
        Every Friday at 07:00 IST a pipeline reads the week’s discussions on Hacker News, Stack Overflow and DEV, counts them with code,
        asks Gemini to group and explain them, checks every claim against the source, and publishes the brief here and by email.
      </PageIntro>

      <SectionsWithNav sections={SECTIONS} label="Sections of this page">
        <Section
          id="pipeline"
          index="01"
          title="The pipeline"
          intro={
            <>
              Ten steps, one run, usually two to three minutes. Each step records its status, time and detail, which the run log below
              shows. The same run, actor by actor, is in the{" "}
              <a href="/components-map.png" className="link">
                components map
              </a>
              .
            </>
          }
        >
          <PipelineDiagram />
        </Section>

        <Section
          id="reliability"
          index="02"
          title="Reliability rules"
          intro="What keeps a brief trustworthy when the model, a community or the network misbehaves."
        >
          <ReliabilityRules />
        </Section>

        <Section
          id="sources"
          index="03"
          title="Data sources"
          intro="Three public communities with free, terms-friendly APIs, chosen because that is where developers talk about review and CI pain in the open."
        >
          <DataSources />
        </Section>

        <Section id="runs" index="04" title="Recent runs" intro="Live from the pipeline_runs table. Hover a step icon for its time and detail.">
          <Suspense fallback={<RunsSkeleton />}>
            <RecentRuns />
          </Suspense>
        </Section>

        <Section
          id="run-now"
          index="05"
          title="Run the pipeline now"
          intro="Regenerates the brief for a week on demand. Passcode-protected, one run per week at a time, with a short cooldown to protect the free API quotas."
        >
          <Suspense fallback={<RunPanelSkeleton />}>
            <RunPanelLoader />
          </Suspense>
        </Section>
      </SectionsWithNav>
    </div>
  );
}

async function RecentRuns() {
  const result = await settle(listRuns(10));
  if (!result.ok) return <ErrorBox title="The run log could not be loaded" kind={result.error.kind} message={result.error.message} />;
  if (result.data.length === 0) {
    return <EmptyNote>No runs yet. The first scheduled run is on Friday at 07:00 IST, or start one below.</EmptyNote>;
  }
  return <RunsTable runs={result.data} />;
}

/** Week choices depend on today's date, so they are computed per request (never baked into the shell). */
async function RunPanelLoader() {
  await connection();
  const weeks = recentWeekEnds(latestWeekEnd(new Date()), 5).map((weekEnd, i) => ({
    value: weekEnd,
    label: `${weekLabel(weekEnd)}${i === 0 ? " · latest" : ""}`,
  }));
  return <RunPanel weeks={weeks} />;
}

function RunsSkeleton() {
  return (
    <div className="card space-y-4 p-5 sm:p-6">
      <p role="status" className="sr-only">
        Loading recent runs…
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
      ))}
    </div>
  );
}

function RunPanelSkeleton() {
  return (
    <div className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
