"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { RunRecord } from "@/lib/contracts";
import { durationBetween, formatDuration, shortId, waitText, weekLabel } from "@/lib/format";
import { RunStatusBadge } from "@/components/ui/badges";
import { AlertIcon, ArrowRightIcon, InfoIcon, LoaderIcon, PlayIcon } from "@/components/ui/icons";
import { StepList } from "./run-steps";

/*
 * "Run now": starts a manual pipeline run (passcode-protected) and follows it live. POST
 * /api/pipeline/run answers 202 { runId } straight away while the work continues on the server; this
 * panel then polls GET /api/runs/:id every 2 s and renders each step as it lands, until the run leaves
 * "running". The current time is only read inside the polling callback, never during render.
 */

export type WeekOption = { value: string; label: string };

type Phase = "idle" | "starting" | "tracking" | "finished" | "lost";
type Tracking = { runId: string; weekEnd: string; notice: string | null };
type StartResponse = { runId?: unknown; weekEnd?: unknown; error?: unknown; retryAfterSec?: unknown };

const POLL_MS = 2000;
const WARN_AFTER_MISSES = 3;
/** About 90 s without a readable update. */
const GIVE_UP_AFTER_MISSES = 45;

export function RunPanel({ weeks }: { weeks: WeekOption[] }) {
  const router = useRouter();
  const uid = useId();
  const passcodeRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [pollIssue, setPollIssue] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  const runId = phase === "tracking" ? (tracking?.runId ?? null) : null;
  const busy = phase === "starting" || phase === "tracking";

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let misses = 0;
    let timer: number | undefined;

    const poll = async () => {
      let next: RunRecord | null = null;
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: "no-store", headers: { accept: "application/json" } });
        if (res.ok) next = asRun(await res.json());
      } catch {
        // A network blip: the next tick tries again.
      }
      if (cancelled) return;

      if (next) {
        misses = 0;
        setRun(next);
        setPollIssue(null);
        if (next.status !== "running") {
          setElapsedMs(durationBetween(next.startedAt, next.finishedAt));
          setPhase("finished");
          router.refresh();
          return;
        }
        const started = Date.parse(next.startedAt);
        setElapsedMs(Number.isNaN(started) ? null : Math.max(0, Date.now() - started));
      } else {
        misses += 1;
        if (misses >= GIVE_UP_AFTER_MISSES) {
          setPollIssue("Lost contact with this run. It may still finish on its own: check “Recent runs” in a few minutes.");
          setPhase("lost");
          return;
        }
        if (misses >= WARN_AFTER_MISSES) setPollIssue("Progress updates are not coming through right now. Still retrying…");
      }
      timer = window.setTimeout(poll, POLL_MS);
    };

    timer = window.setTimeout(poll, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runId, router]);

  // Focus is moved after the commit that re-enables the input (a disabled input cannot take focus).
  useEffect(() => {
    if (focusRequest > 0) passcodeRef.current?.focus();
  }, [focusRequest]);

  function fail(message: string, focusPasscode = false) {
    setError(message);
    setPhase("idle");
    if (focusPasscode) setFocusRequest((n) => n + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const passcode = String(form.get("passcode") ?? "").trim();
    const weekEnd = String(form.get("weekEnd") ?? "");
    if (!passcode) {
      fail("Enter the passcode to start a run.", true);
      return;
    }

    setPhase("starting");
    setError(null);
    setTracking(null);
    setRun(null);
    setElapsedMs(null);
    setPollIssue(null);

    let res: Response;
    try {
      res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(weekEnd ? { passcode, weekEnd } : { passcode }),
      });
    } catch {
      fail("Could not reach the server. Check your connection and try again.");
      return;
    }
    const body = ((await res.json().catch(() => null)) ?? {}) as StartResponse;
    const serverError = typeof body.error === "string" ? body.error : null;

    if (res.status === 202 && typeof body.runId === "string") {
      if (passcodeRef.current) passcodeRef.current.value = "";
      setTracking({ runId: body.runId, weekEnd: typeof body.weekEnd === "string" ? body.weekEnd : weekEnd, notice: null });
      setPhase("tracking");
      return;
    }
    if (res.status === 409 && typeof body.runId === "string") {
      setTracking({
        runId: body.runId,
        weekEnd,
        notice: "A run for this week was already in progress, so you are watching that one instead of starting a second.",
      });
      setPhase("tracking");
      return;
    }
    if (res.status === 401) {
      fail("That passcode is not right. Check it and try again.", true);
    } else if (res.status === 409) {
      fail(serverError ?? "A run for this week is already in progress. Try again when it has finished.");
    } else if (res.status === 429) {
      const wait = typeof body.retryAfterSec === "number" ? body.retryAfterSec : Number(res.headers.get("retry-after") ?? 0);
      fail(`A run started moments ago. To protect the free API quotas, wait ${waitText(wait)} and try again.`);
    } else if (res.status === 400) {
      fail(serverError ?? "The server did not accept that request.");
    } else {
      fail(serverError ? `The run could not start: ${serverError}` : `The run could not start (HTTP ${res.status}). Try again in a minute.`);
    }
  }

  const lastStep = run?.steps.at(-1);
  const liveMessage =
    phase === "starting"
      ? "Starting the run"
      : phase === "finished" && run
        ? `Run finished: ${run.status}`
        : lastStep
          ? `${lastStep.name}: ${lastStep.status}`
          : "";

  return (
    <div className="card overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <form onSubmit={onSubmit} noValidate className="space-y-4 border-b border-rule p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div>
            <label htmlFor={`${uid}-passcode`} className="block text-sm font-medium text-ink">
              Passcode
            </label>
            <input
              ref={passcodeRef}
              id={`${uid}-passcode`}
              name="passcode"
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={busy}
              aria-invalid={error !== null && phase === "idle" ? true : undefined}
              aria-describedby={error ? `${uid}-error` : undefined}
              className="mt-1.5 block w-full rounded-lg border border-rule-strong bg-surface px-3 py-2 text-ink transition-colors hover:border-ink-3 disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor={`${uid}-week`} className="block text-sm font-medium text-ink">
              Week
            </label>
            <select
              id={`${uid}-week`}
              name="weekEnd"
              defaultValue={weeks[0]?.value}
              disabled={busy}
              aria-describedby={`${uid}-week-hint`}
              className="mt-1.5 block w-full rounded-lg border border-rule-strong bg-surface px-3 py-2 text-ink transition-colors hover:border-ink-3 disabled:opacity-60"
            >
              {weeks.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
            <p id={`${uid}-week-hint`} className="mt-1.5 text-xs text-ink-3">
              Weeks run Friday to Friday, 00:00 IST. Re-running a week replaces its brief.
            </p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <LoaderIcon className="size-4" /> : <PlayIcon className="size-4" />}
            {phase === "starting" ? "Starting…" : phase === "tracking" ? "Running…" : "Run now"}
          </button>
          {error ? (
            <p id={`${uid}-error`} role="alert" className="flex gap-2 rounded-lg bg-bad-tint px-3 py-2.5 text-sm text-ink">
              <AlertIcon className="mt-0.5 size-4 text-bad" />
              <span>{error}</span>
            </p>
          ) : null}
        </form>

        <div className="min-w-0 p-5 sm:p-6">
          <p className="sr-only" aria-live="polite">
            {liveMessage}
          </p>
          {phase === "idle" && !run ? (
            <div className="flex h-full min-h-40 flex-col items-start justify-center gap-2 text-sm text-ink-2">
              <InfoIcon className="size-5 text-ink-3" />
              <p className="max-w-md">
                Live progress appears here: every step with its status, time and detail, refreshed every 2 seconds. A full run usually
                takes two to three minutes.
              </p>
            </div>
          ) : phase === "starting" ? (
            <p className="flex min-h-40 items-center gap-2 text-sm text-ink-2">
              <LoaderIcon className="size-4 text-accent" />
              Starting the run…
            </p>
          ) : (
            <RunProgress run={run} tracking={tracking} phase={phase} elapsedMs={elapsedMs} pollIssue={pollIssue} />
          )}
        </div>
      </div>
    </div>
  );
}

function RunProgress({
  run,
  tracking,
  phase,
  elapsedMs,
  pollIssue,
}: {
  run: RunRecord | null;
  tracking: Tracking | null;
  phase: Phase;
  elapsedMs: number | null;
  pollIssue: string | null;
}) {
  const weekEnd = run?.weekEnd ?? tracking?.weekEnd ?? null;
  const runId = run?.id ?? tracking?.runId ?? null;
  const done = phase === "finished" && run !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold text-ink">
          Run{" "}
          {runId ? (
            <code className="font-mono text-xs font-normal text-ink-2" title={runId}>
              {shortId(runId)}
            </code>
          ) : null}
        </h3>
        <RunStatusBadge status={run?.status ?? "running"} />
        {weekEnd ? <span className="text-sm text-ink-3">week {weekLabel(weekEnd)}</span> : null}
        {elapsedMs !== null ? <span className="ml-auto text-sm tabular-nums text-ink-3">{formatDuration(elapsedMs)}</span> : null}
      </div>

      {tracking?.notice ? (
        <p className="flex gap-2 rounded-lg bg-accent-tint/60 px-3 py-2 text-sm text-ink">
          <InfoIcon className="mt-0.5 size-4 text-accent" />
          <span>{tracking.notice}</span>
        </p>
      ) : null}
      {pollIssue ? (
        <p className="flex gap-2 rounded-lg bg-warn-tint px-3 py-2 text-sm text-ink">
          <AlertIcon className="mt-0.5 size-4 text-warn" />
          <span>{pollIssue}</span>
        </p>
      ) : null}

      {run && run.steps.length > 0 ? <StepList steps={run.steps} /> : null}
      {phase === "tracking" ? (
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <LoaderIcon className="size-4 text-accent" />
          {run && run.steps.length > 0 ? "Working on the next step…" : "Waiting for the first step…"}
        </p>
      ) : null}

      {done ? (
        <div className={`rounded-xl px-4 py-3 ${run.status === "failed" ? "bg-bad-tint" : "bg-good-tint"}`}>
          <p className="text-sm font-semibold text-ink">
            {run.status === "complete"
              ? "Done: the brief is published."
              : run.status === "partial"
                ? "Done with gaps: the brief is published and marked partial."
                : "The run failed."}
          </p>
          {run.error ? <p className="mt-1 break-words text-sm text-ink-2">{run.error}</p> : null}
          {run.status === "failed" ? (
            <p className="mt-1 text-sm text-ink-2">Any brief already saved for this week is unchanged.</p>
          ) : null}
          {weekEnd ? (
            <Link href={`/briefs/${weekEnd}`} className="link mt-2 inline-flex items-center gap-1.5 text-sm font-semibold">
              Open the brief for {weekLabel(weekEnd)}
              <ArrowRightIcon className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Light shape check (the full zod schema stays on the server, out of the browser bundle). */
function asRun(value: unknown): RunRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<RunRecord>;
  return typeof v.id === "string" && typeof v.status === "string" && typeof v.startedAt === "string" && Array.isArray(v.steps)
    ? (v as RunRecord)
    : null;
}
