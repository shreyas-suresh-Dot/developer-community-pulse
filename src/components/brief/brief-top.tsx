import type { ReactNode } from "react";
import type { BriefRecord, Change } from "@/lib/contracts";
import { change } from "@/lib/pipeline/trend";
import { changeText, formatCount, formatIstDate, formatIstDateTime, percent, plural, sourceName, weekTitle } from "@/lib/format";
import { DeliveryBadge, ModeBadge, StatusBadge, TriggerBadge } from "@/components/ui/badges";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "@/components/ui/icons";
import { Callout } from "@/components/ui/notices";
import { Sparkline } from "@/components/ui/sparkline";

/*
 * The front page of a brief: which week, when and how it was delivered, the one-line headline and four
 * KPI tiles. Every number here comes from stats/quality (code); only the headline is AI-written.
 */

export const BRIEF_SECTIONS = [
  { id: "pain-points", label: "Pain points" },
  { id: "trending", label: "Trending topics" },
  { id: "keywords", label: "Keyword pulse" },
  { id: "unresolved", label: "Unresolved" },
  { id: "objections", label: "Objections" },
  { id: "sprint", label: "Sprint planning" },
  { id: "watchlist", label: "Watchlist" },
  { id: "method", label: "How it was made" },
] as const;

export function BriefTop({ brief }: { brief: BriefRecord }) {
  const { stats, analysis, quality, delivery } = brief;
  const week = stats.weeks[3];
  const delivered = delivery.status === "sent" && delivery.at ? delivery.at : brief.generatedAt;
  const failedSources = quality.sources.filter((s) => !s.ok);

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="space-y-4">
        <p className="kicker">Weekly brief · week ending {formatIstDate(`${brief.weekEnd}T00:00:00+05:30`)}</p>
        <h1 className="font-serif text-[2.75rem] font-medium leading-none tracking-tight sm:text-6xl">{weekTitle(week)}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
          <span>
            {brief.trigger === "cron" ? "Delivered" : "Generated"} {formatIstDateTime(delivered)}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={brief.status} />
            <DeliveryBadge delivery={delivery} />
            <ModeBadge analysis={analysis} />
            {brief.trigger !== "cron" ? <TriggerBadge trigger={brief.trigger} /> : null}
          </span>
        </div>
      </header>

      {brief.status === "failed" ? (
        <Callout tone="warn" title="This run failed">
          The pipeline could not finish this week. What it did collect is shown below; see “How this brief was made” for the step that
          failed.
        </Callout>
      ) : null}
      {failedSources.length > 0 ? (
        <Callout tone="warn" title={`Partial brief: ${failedSources.map((s) => sourceName(s.source)).join(" and ")} did not respond`}>
          Posts from {failedSources.length === 1 ? "that community are" : "those communities are"} missing from this week’s counts, so
          trends involving {failedSources.length === 1 ? "it" : "them"} may read low.{" "}
          {failedSources
            .map((s) => s.error)
            .filter(Boolean)
            .join(" ")}
        </Callout>
      ) : null}
      {!analysis || analysis.mode === "fallback" ? (
        <Callout tone="warn" title="AI summary unavailable this week: this brief is keyword-based">
          <p>
            Gemini’s summary could not be used, so this brief was assembled from keyword matches and code-computed counts only. Counts,
            trends and thread links are unaffected; pain points are grouped by category instead of clustered by the AI, and objections
            and sprint ideas are not drafted.
          </p>
          {quality.synthesis.error ? <p className="mt-1 break-words text-xs text-ink-3">Reason recorded by the run: {quality.synthesis.error}</p> : null}
        </Callout>
      ) : null}

      <div className="space-y-6">
        <p className="max-w-4xl border-l-2 border-accent pl-4 font-serif text-[1.5rem] leading-snug tracking-tight text-ink sm:pl-6 sm:text-[2rem] sm:leading-[1.25]">
          {analysis?.headline ?? fallbackHeadline(brief)}
        </p>
        <KpiTiles brief={brief} />
      </div>

      <nav aria-label="Sections of this brief" className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        <span className="mr-2 text-ink-3">On this page</span>
        {BRIEF_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-rule px-3 py-1 text-ink-2 transition-colors hover:border-rule-strong hover:bg-surface hover:text-ink">
            {s.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function fallbackHeadline(brief: BriefRecord): string {
  const top = brief.stats.categories[0];
  const threads = brief.stats.totals.threads[3];
  if (!top || threads === 0) return "A quiet week: no matching discussions were found in the monitored communities.";
  return `${plural(threads, "matching thread")} this week; ${top.name} led with ${plural(top.threads[3], "thread")}.`;
}

function KpiTiles({ brief }: { brief: BriefRecord }) {
  const { stats, quality } = brief;
  const labels = stats.weeks.map((w) => w.label);
  const threads = stats.totals.threads;
  const mentions = stats.totals.mentions;
  const healthy = quality.sources.filter((s) => s.ok).length;
  const totalSources = quality.sources.length || 3;
  const down = quality.sources.filter((s) => !s.ok).map((s) => sourceName(s.source));
  const { checked, relevant } = quality.classification;
  const relevance = percent(relevant, checked);

  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-rule bg-rule min-[400px]:grid-cols-2 lg:grid-cols-4">
      <Tile label="Threads this week" value={formatCount(threads[3])} hint="Distinct discussions with a matching post">
        <DeltaLine change={change(threads[3], threads[2])} />
        <Sparkline values={threads} labels={labels} unit="threads" width={112} height={30} />
      </Tile>
      <Tile label="Mentions" value={formatCount(mentions[3])} hint="Matching posts, comments and questions">
        <DeltaLine change={change(mentions[3], mentions[2])} />
        <Sparkline values={mentions} labels={labels} unit="mentions" width={112} height={30} />
      </Tile>
      <Tile label="Sources healthy" value={`${healthy}/${totalSources}`} hint="Communities that answered this run">
        <p className="text-sm text-ink-2">{down.length === 0 ? "Hacker News, Stack Overflow and DEV all responded" : `${down.join(" and ")} did not respond`}</p>
        <SourceDots sources={quality.sources.map((s) => ({ name: sourceName(s.source), ok: s.ok }))} />
      </Tile>
      <Tile label="AI relevance check" value={relevance === null ? "–" : `${relevance}%`} hint="Matched threads the AI judged on-topic">
        {relevance === null ? (
          <p className="text-sm text-ink-2">Not run this week: the AI step was unavailable.</p>
        ) : (
          <>
            <p className="text-sm text-ink-2">
              {formatCount(relevant)} of {plural(checked, "thread")} on-topic
            </p>
            <div className="h-1.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-accent-tint" aria-hidden="true">
              <div className="h-full rounded-full bg-accent" style={{ width: `${relevance}%` }} />
            </div>
          </>
        )}
      </Tile>
    </dl>
  );
}

function Tile({ label, value, hint, children }: { label: string; value: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-surface p-4 sm:p-5">
      <dt className="text-sm font-medium text-ink-2" title={hint}>
        {label}
      </dt>
      <dd className="flex flex-col items-start gap-2">
        <span className="text-[2.25rem] font-semibold leading-none tracking-tight text-ink">{value}</span>
        {children}
      </dd>
    </div>
  );
}

export function DeltaLine({ change: c }: { change: Change }) {
  const Icon = c.abs > 0 ? ArrowUpRightIcon : c.abs < 0 ? ArrowDownRightIcon : ArrowRightIcon;
  return (
    <p className="flex items-center gap-1 text-sm text-ink-2">
      <Icon className="size-4 text-ink-3" />
      <span>{changeText(c)}</span>
    </p>
  );
}

function SourceDots({ sources }: { sources: { name: string; ok: boolean }[] }) {
  return (
    <ul className="flex gap-1.5" aria-hidden="true">
      {sources.map((s) => (
        <li key={s.name} title={`${s.name}: ${s.ok ? "responded" : "failed"}`} className={`h-1.5 w-6 rounded-full ${s.ok ? "bg-good" : "bg-bad"}`} />
      ))}
    </ul>
  );
}
