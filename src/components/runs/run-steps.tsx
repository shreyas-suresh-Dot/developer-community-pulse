import Link from "next/link";
import type { RunRecord, RunStep } from "@/lib/contracts";
import { durationBetween, formatDuration, formatIstDateTime, shortId, weekLabel } from "@/lib/format";
import { RunStatusBadge, StepStatusIcon, TriggerBadge } from "@/components/ui/badges";

/*
 * Pipeline run log. StepList is shared with the client-side Run panel (no server-only imports here),
 * RunsTable renders the recent runs from pipeline_runs on /how-it-works.
 */

/** Every step of one run: status icon, name, detail and time. */
export function StepList({ steps }: { steps: RunStep[] }) {
  return (
    <ol className="divide-y divide-rule">
      {steps.map((s, i) => (
        <li key={`${i}-${s.name}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2.5">
          <StepStatusIcon status={s.status} name={s.name} className="mt-0.5 size-4" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{s.name}</p>
            {s.detail ? <p className="break-words text-sm text-ink-2">{s.detail}</p> : null}
          </div>
          <span className="pt-0.5 text-xs tabular-nums text-ink-3">{s.ms === null ? "–" : formatDuration(s.ms)}</span>
        </li>
      ))}
    </ol>
  );
}

function StepDots({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) return <span className="text-sm text-ink-3">No steps recorded</span>;
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {steps.map((s, i) => (
        <li key={`${i}-${s.name}`} className="inline-flex">
          <StepStatusIcon
            status={s.status}
            name={s.name}
            detail={[s.ms === null ? null : formatDuration(s.ms), s.detail].filter(Boolean).join(" · ")}
            className="size-[1.125rem]"
          />
        </li>
      ))}
    </ol>
  );
}

export function RunsTable({ runs }: { runs: RunRecord[] }) {
  return (
    <div className="card px-4 py-3 sm:px-6 sm:py-4">
      <table className="data-table">
        <caption className="sr-only">Most recent pipeline runs, newest first. Hover a step icon for its time and detail.</caption>
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Status</th>
            <th scope="col">Trigger</th>
            <th scope="col">Week</th>
            <th scope="col">Started</th>
            <th scope="col" className="num">
              Duration
            </th>
            <th scope="col">Steps</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const ms = durationBetween(run.startedAt, run.finishedAt);
            return (
              <tr key={run.id}>
                <th scope="row">
                  <code className="font-mono text-xs font-normal text-ink-2" title={run.id}>
                    {shortId(run.id)}
                  </code>
                </th>
                <td data-label="Status">
                  <RunStatusBadge status={run.status} />
                </td>
                <td data-label="Trigger">
                  <TriggerBadge trigger={run.trigger} />
                </td>
                <td data-label="Week" className="whitespace-nowrap text-sm">
                  {run.briefId ? (
                    <Link href={`/briefs/${run.weekEnd}`} className="link">
                      {weekLabel(run.weekEnd)}
                    </Link>
                  ) : (
                    <span className="text-ink-2">{weekLabel(run.weekEnd)}</span>
                  )}
                </td>
                <td data-label="Started" className="wide whitespace-nowrap text-sm text-ink-2">
                  {formatIstDateTime(run.startedAt)}
                </td>
                <td data-label="Duration" className="num whitespace-nowrap text-sm text-ink-2">
                  {run.status === "running" ? "running…" : ms === null ? "–" : formatDuration(ms)}
                </td>
                <td data-label="Steps" className="wide">
                  <div className="flex flex-col items-end gap-1 md:items-start">
                    <StepDots steps={run.steps} />
                    {run.error ? <p className="max-w-[16rem] break-words text-xs text-bad">{run.error}</p> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
