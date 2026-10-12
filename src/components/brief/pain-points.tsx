import type { Analysis, Change, PainPoint, Stats } from "@/lib/contracts";
import { anchorId, changeShort, formatCount, plural, sourceName } from "@/lib/format";
import { Badge, CategoryChip, TrendBadge } from "@/components/ui/badges";
import { CheckCircleIcon, FlagIcon } from "@/components/ui/icons";
import { Section } from "@/components/ui/layout";
import { EmptyNote } from "@/components/ui/notices";
import { EvidenceList, resolve, ThreadLink, type Evidence } from "./evidence";

/*
 * 01 · Top pain points. The AI groups threads into pain points and writes the words; the two counts
 * (threads this week vs last week) and the trend label are computed by code from the thread keys that
 * survived validation, and every quote was checked to be verbatim before it reached this page.
 */

export function painPointAnchor(id: string): string {
  return anchorId("pain", id);
}

export function PainPointsSection({ index, analysis, stats }: { index: string; analysis: Analysis | null; stats: Stats }) {
  const names = new Map(stats.categories.map((c) => [c.slug, c.name]));
  const points = analysis?.painPoints ?? [];
  const fallback = analysis?.mode === "fallback";

  return (
    <Section
      id="pain-points"
      index={index}
      title="Top pain points"
      intro={
        fallback
          ? "The AI summary was unavailable, so these are grouped by monitored category from keyword matches instead of clustered by the AI. Counts are distinct threads, this week vs last week."
          : "Ranked by how many distinct threads raised each problem this week. The AI groups the threads; code counts them and checks every link and quote."
      }
    >
      {!analysis ? (
        <EmptyNote>
          No pain points this week: the analysis step did not produce a summary. The counts under “Trending topics” and “Keyword pulse”
          are computed by code and are unaffected.
        </EmptyNote>
      ) : points.length === 0 ? (
        <EmptyNote>
          No recurring pain point stood out this week, so none is listed rather than one being invented. See “Trending topics” for what was
          discussed.
        </EmptyNote>
      ) : (
        <ol className="space-y-5">
          {points.map((point, i) => (
            <PainPointCard
              key={point.id || i}
              point={point}
              position={i}
              categoryName={names.get(point.category) ?? point.category}
              evidence={analysis.evidence}
              judged={analysis.mode === "ai"}
            />
          ))}
        </ol>
      )}
    </Section>
  );
}

function PainPointCard({
  point,
  position,
  categoryName,
  evidence,
  judged,
}: {
  point: PainPoint;
  position: number;
  categoryName: string;
  evidence: Evidence;
  /** False for the keyword-based fallback, where nobody judged whether a problem is resolved. */
  judged: boolean;
}) {
  const anchor = painPointAnchor(point.id || String(position + 1));
  const thisWeek = resolve(point.thisWeek, evidence);
  const lastWeek = resolve(point.lastWeek, evidence);
  const quoteThread = point.quote ? evidence[point.quote.threadKey] : undefined;

  return (
    <li id={anchor} aria-labelledby={`${anchor}-title`} className="card scroll-mt-6 overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className="mr-0.5 text-sm font-semibold tabular-nums text-accent">
            #{position + 1}
          </span>
          <CategoryChip>{categoryName}</CategoryChip>
          {point.unresolved ? (
            <Badge tone="warn" icon={<FlagIcon className="size-3.5" />} title="Threads show no accepted answer, no good tool, or only workarounds">
              Unresolved
            </Badge>
          ) : judged ? (
            <Badge tone="quiet" icon={<CheckCircleIcon className="size-3.5" />} title="Threads share answers or tools that work">
              Answers exist
            </Badge>
          ) : null}
        </div>

        <div className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <h3 id={`${anchor}-title`} className="font-serif text-[1.375rem] font-medium leading-snug tracking-tight sm:text-2xl">
              {point.title}
            </h3>
            <p className="mt-2 max-w-3xl text-ink-2">{point.summary}</p>
          </div>
          <WeekCounts change={point.change} />
        </div>

        {point.quote ? (
          <figure className="mt-5 max-w-3xl border-l-2 border-accent/60 pl-4 sm:pl-5">
            <blockquote className="font-serif text-lg italic leading-snug text-ink sm:text-xl">
              <p>“{point.quote.text}”</p>
            </blockquote>
            {quoteThread ? (
              <figcaption className="mt-2 text-sm text-ink-3">
                <span aria-hidden="true">— </span>
                <ThreadLink thread={quoteThread} /> · {sourceName(quoteThread.source)}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </div>

      <div className="border-t border-rule bg-sunk/60 px-5 py-4 sm:px-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
          Evidence · {plural(point.change.current, "thread")} this week
          {thisWeek.length < point.change.current ? `, ${formatCount(thisWeek.length)} linked` : ""}
        </p>
        <EvidenceList threads={thisWeek} visible={3} />
        {lastWeek.length > 0 ? (
          <details className="disclosure mt-4">
            <summary className="rounded text-sm font-medium text-ink-2 hover:text-ink">Last week’s threads ({formatCount(lastWeek.length)})</summary>
            <div className="mt-3">
              <EvidenceList threads={lastWeek} visible={lastWeek.length} />
            </div>
          </details>
        ) : null}
      </div>
    </li>
  );
}

/** "This week 7 · Last week 3" with the code-computed trend label. */
function WeekCounts({ change }: { change: Change }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2 md:flex-col md:items-end md:gap-y-2.5">
      <dl className="flex gap-6 md:text-right">
        <div>
          <dt className="text-xs font-medium text-ink-3">Threads this week</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums text-ink">{formatCount(change.current)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-3">Last week</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums text-ink-3">{formatCount(change.previous)}</dd>
        </div>
      </dl>
      <p className="flex items-center gap-2 pb-0.5 md:pb-0">
        <TrendBadge trend={change.trend} />
        <span className="text-xs tabular-nums text-ink-3">{changeShort(change)}</span>
      </p>
    </div>
  );
}
