import Link from "next/link";
import type { ReactNode } from "react";
import type { BriefRecord, SourceRun } from "@/lib/contracts";
import { formatCount, formatDuration, formatIstDateTime, percent, shortId, sourceName } from "@/lib/format";
import { AnalysisModeBadge, Badge } from "@/components/ui/badges";
import { AlertIcon, CheckCircleIcon, CodeIcon, DatabaseIcon, InfoIcon, ShieldIcon, XCircleIcon } from "@/components/ui/icons";
import { Section, SubHeading } from "@/components/ui/layout";
import { EmptyNote } from "@/components/ui/notices";
import { SourceGlyph } from "./evidence";

/*
 * 08 · How this brief was made: the run's own quality record. Checks, per-source health, the matching
 * funnel, what the AI did (and with which model), citation validation, caps and caveats — so a reader
 * can tell exactly how much to trust every number above.
 */

export function MethodSection({ index, brief }: { index: string; brief: BriefRecord }) {
  const { quality, analysis } = brief;
  const { matching, classification, synthesis, citations } = quality;
  const passed = quality.checks.filter((c) => c.passed).length;
  const caveats = analysis?.caveats ?? [];
  const relevance = percent(classification.relevant, classification.checked);

  return (
    <Section
      id="method"
      index={index}
      title="How this brief was made"
      intro="The run’s own quality record: what was collected, what the AI did, what was checked and what was capped. Nothing is silently dropped."
    >
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SubHeading icon={<ShieldIcon className="size-4 text-ink-3" />}>Quality checks</SubHeading>
              <p className="text-sm text-ink-3">
                {passed} of {quality.checks.length} passed
              </p>
            </div>
            {quality.checks.length === 0 ? (
              <EmptyNote className="mt-4">This run recorded no checks.</EmptyNote>
            ) : (
              <ul className="mt-4 space-y-3.5">
                {quality.checks.map((c, i) => (
                  <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
                    {c.passed ? <CheckCircleIcon className="mt-0.5 size-5 text-good" /> : <AlertIcon className="mt-0.5 size-5 text-warn" />}
                    <div className="min-w-0">
                      <p className="font-medium leading-snug text-ink">
                        {c.name}
                        <span className="sr-only">{c.passed ? ": passed" : ": did not pass"}</span>
                      </p>
                      <p className="text-sm text-ink-2">{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5 sm:p-6">
            <SubHeading icon={<CodeIcon className="size-4 text-ink-3" />}>The numbers behind the brief</SubHeading>
            <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Facts
                title="Matching (code)"
                rows={[
                  ["Posts fetched", formatCount(matching.fetched)],
                  ["Matched a keyword", formatCount(matching.matched)],
                  ["Dropped, no context term", formatCount(matching.droppedNoContext)],
                  ["Threads", formatCount(matching.threads)],
                ]}
              />
              <Facts
                title="AI relevance check"
                rows={[
                  ["Candidates", formatCount(classification.candidates)],
                  ["Checked", `${formatCount(classification.checked)} (${formatCount(classification.fromCache)} cached)`],
                  ["On-topic", relevance === null ? "–" : `${formatCount(classification.relevant)} (${relevance}%)`],
                  ["Failed", formatCount(classification.failed)],
                  ["Model", classification.models.length > 0 ? classification.models.join(", ") : "none"],
                ]}
              />
              <Facts
                title="AI summary"
                rows={[
                  ["Mode", <AnalysisModeBadge key="mode" mode={synthesis.mode} />],
                  ["Model", synthesis.model ?? "none"],
                  ["Attempts", formatCount(synthesis.attempts)],
                  ["Time", formatDuration(synthesis.ms)],
                ]}
                note={synthesis.error ? `Error: ${synthesis.error}` : undefined}
              />
              <Facts
                title="Citations (validated)"
                rows={[
                  ["Threads cited", formatCount(citations.cited)],
                  ["Valid", formatCount(citations.valid)],
                  ["Dropped", formatCount(citations.dropped)],
                ]}
                note="A citation survives only if the thread exists in the collected data and in the right week."
              />
            </div>
          </div>
        </div>

        <div className="card px-4 py-3 sm:px-6 sm:py-4">
          <div className="pb-2 pt-1">
            <SubHeading icon={<DatabaseIcon className="size-4 text-ink-3" />}>Sources this run</SubHeading>
          </div>
          {quality.sources.length === 0 ? (
            <EmptyNote className="mb-2">No source was queried in this run.</EmptyNote>
          ) : (
            <table className="data-table">
              <caption className="sr-only">Per-source collection results for this run</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Items
                  </th>
                  <th scope="col" className="num">
                    Requests
                  </th>
                  <th scope="col" className="num">
                    Time
                  </th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {quality.sources.map((s) => (
                  <SourceRow key={s.source} source={s} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <SubHeading>Caps</SubHeading>
            {quality.caps.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">Nothing was capped in this run.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {quality.caps.map((c, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-rule pb-2">
                    <span className="text-ink">{c.what}</span>
                    <span className="tabular-nums text-ink-2">
                      kept {formatCount(c.kept)} · left out {formatCount(c.dropped)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SubHeading>Caveats</SubHeading>
            {caveats.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">{analysis ? "No caveats were recorded for this week." : "No analysis, so no caveats were written."}</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-ink-2">
                {caveats.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <InfoIcon className="mt-0.5 size-4 text-ink-3" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule pt-4 text-sm text-ink-3">
          <span>
            Run{" "}
            {quality.runId ? (
              <code className="font-mono text-xs text-ink-2" title={quality.runId}>
                {shortId(quality.runId)}
              </code>
            ) : (
              "id not recorded"
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span>took {formatDuration(quality.durationMs)}</span>
          <span aria-hidden="true">·</span>
          <span>generated {formatIstDateTime(brief.generatedAt)}</span>
          <span aria-hidden="true">·</span>
          <Link href="/how-it-works#runs" className="link">
            Run log and pipeline
          </Link>
        </p>
      </div>
    </Section>
  );
}

function Facts({ title, rows, note }: { title: string; rows: [string, ReactNode][]; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</p>
      <dl className="mt-2 space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-2">{label}</dt>
            <dd className="min-w-0 break-words text-right font-medium tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {note ? <p className="mt-2 break-words text-xs text-ink-3">{note}</p> : null}
    </div>
  );
}

function SourceRow({ source: s }: { source: SourceRun }) {
  const notes = s.error ? [s.error, ...s.notes] : s.notes;
  return (
    <tr>
      <th scope="row">
        <span className="inline-flex items-center gap-2">
          <SourceGlyph source={s.source} />
          {sourceName(s.source)}
        </span>
      </th>
      <td data-label="Status">
        {s.ok ? (
          <Badge tone="good" icon={<CheckCircleIcon className="size-3.5" />}>
            Responded
          </Badge>
        ) : (
          <Badge tone="bad" icon={<XCircleIcon className="size-3.5" />}>
            Failed
          </Badge>
        )}
      </td>
      <td data-label="Items" className="num">
        {formatCount(s.items)}
      </td>
      <td data-label="Requests" className="num">
        {formatCount(s.requests)}
      </td>
      <td data-label="Time" className="num whitespace-nowrap">
        {formatDuration(s.ms)}
      </td>
      <td data-label="Notes" className="wide text-sm text-ink-2">
        {notes.length === 0 ? (
          <span className="text-ink-3">–</span>
        ) : (
          <ul className="space-y-0.5">
            {notes.map((n, i) => (
              <li key={i} className={s.error && i === 0 ? "text-bad" : undefined}>
                {n}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

