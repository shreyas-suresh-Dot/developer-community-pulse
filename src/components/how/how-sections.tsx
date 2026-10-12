import type { ReactNode } from "react";
import type { SourceSlug } from "@/lib/contracts";
import { SourceGlyph } from "@/components/brief/evidence";
import { cx } from "@/components/ui/cx";
import {
  AlertIcon,
  ClockIcon,
  CodeIcon,
  DatabaseIcon,
  GlobeIcon,
  MailIcon,
  MessageIcon,
  ShieldIcon,
  SparkleIcon,
  XCircleIcon,
} from "@/components/ui/icons";

/*
 * Static explainers for /how-it-works: the pipeline as a components diagram (styled HTML, so it reflows
 * from four columns on desktop to one column on a phone and reads as nested ordered lists to a screen
 * reader), the reliability rules and the data sources.
 */

/* ----------------------------- Pipeline diagram ----------------------------- */

type Kind = "schedule" | "supabase" | "http" | "code" | "ai" | "check" | "deliver";

const KIND: Record<Kind, { tag: string; icon: (className: string) => ReactNode }> = {
  schedule: { tag: "Schedule", icon: (c) => <ClockIcon className={c} /> },
  supabase: { tag: "Supabase", icon: (c) => <DatabaseIcon className={c} /> },
  http: { tag: "Public APIs", icon: (c) => <GlobeIcon className={c} /> },
  code: { tag: "Code", icon: (c) => <CodeIcon className={c} /> },
  ai: { tag: "AI · Gemini", icon: (c) => <SparkleIcon className={c} /> },
  check: { tag: "Code", icon: (c) => <ShieldIcon className={c} /> },
  deliver: { tag: "Email + web", icon: (c) => <MailIcon className={c} /> },
};

type Step = { kind: Kind; name: string; detail: string; parallel?: string[] };
type Phase = { title: string; steps: Step[]; note?: string };

const PHASES: Phase[] = [
  {
    title: "Trigger",
    steps: [
      { kind: "schedule", name: "Vercel Cron", detail: "Every Friday at 07:00 IST, or on demand with “Run now” below." },
      { kind: "supabase", name: "Load topic config", detail: "Active categories, keywords, context terms and sources, read fresh each run." },
    ],
  },
  {
    title: "Collect & count",
    steps: [
      {
        kind: "http",
        name: "Collectors",
        detail: "Four weeks of posts, in parallel. Timeouts and one retry; a failing source is isolated.",
        parallel: ["HN", "Stack Overflow", "DEV"],
      },
      { kind: "code", name: "Matcher", detail: "Keywords plus context terms, word-boundary safe; generic keywords need a context term." },
      { kind: "code", name: "Stats", detail: "Mentions and threads per keyword, category and week; change and trend labels." },
    ],
  },
  {
    title: "Understand",
    steps: [
      { kind: "ai", name: "AI classify", detail: "Is each thread on-topic, and which pain point? Cached per thread." },
      { kind: "ai", name: "AI synthesize", detail: "Clusters pain points and drafts underserved problems, objections and sprint ideas." },
      { kind: "check", name: "Validator", detail: "Citations must exist in the right week, quotes must be verbatim, counts are recomputed." },
    ],
    note: "Gemini unavailable? A keyword-based fallback brief is built instead and marked as such.",
  },
  {
    title: "Publish",
    steps: [
      { kind: "supabase", name: "Supabase briefs", detail: "One brief per week, upserted; every step logged to pipeline_runs." },
      { kind: "deliver", name: "Delivery", detail: "Email with the headline and top pain points, and the full brief on this site.", parallel: ["Email · Resend", "Web"] },
    ],
  },
];

export function PipelineDiagram() {
  return (
    <figure aria-labelledby="pipeline-caption" className="card p-5 sm:p-6 lg:p-7">
      <ol className="grid lg:grid-cols-4">
        {PHASES.map((phase, i) => (
          <li key={phase.title} className="relative lg:px-3.5 lg:first:pl-0 lg:last:pr-0">
            <p className="kicker">
              <span className="text-ink-3">{i + 1} ·</span> {phase.title}
            </p>
            <ol className="mt-3">
              {phase.steps.map((step, j) => (
                <li key={step.name}>
                  {j > 0 ? <DownArrow /> : null}
                  <Node step={step} />
                </li>
              ))}
            </ol>
            {phase.note ? (
              <p className="mt-3 flex gap-2 rounded-xl border border-dashed border-rule-strong px-3 py-2.5 text-xs leading-snug text-ink-2">
                <AlertIcon className="mt-px size-3.5 text-warn" />
                <span>{phase.note}</span>
              </p>
            ) : null}
            {i < PHASES.length - 1 ? (
              <>
                <div className="py-2 lg:hidden">
                  <DownArrow />
                </div>
                <span
                  aria-hidden="true"
                  className="absolute right-0 top-[3.6rem] z-10 hidden size-7 translate-x-1/2 items-center justify-center rounded-full border border-rule bg-surface text-ink-3 lg:flex"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </>
            ) : null}
          </li>
        ))}
      </ol>
      <figcaption id="pipeline-caption" className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-4 text-sm text-ink-2">
        <span className="font-medium text-ink">One weekly run, start to finish.</span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-[4px] border border-accent/40 bg-accent-tint" />
          AI steps (Gemini): words and groupings only
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-[4px] border border-rule-strong bg-surface" />
          Deterministic code, storage and delivery: every number
        </span>
      </figcaption>
    </figure>
  );
}

function Node({ step }: { step: Step }) {
  const ai = step.kind === "ai";
  const kind = KIND[step.kind];
  return (
    <div className={cx("rounded-xl border p-3", ai ? "border-accent/40 bg-accent-tint/60" : "border-rule bg-surface")}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg", ai ? "bg-accent text-surface" : "bg-sunk text-ink-2")}
        >
          {kind.icon("size-[1.125rem]")}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-ink">{step.name}</p>
          <p className={cx("mt-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]", ai ? "text-accent-strong" : "text-ink-3")}>
            {kind.tag}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[0.8125rem] leading-snug text-ink-2">{step.detail}</p>
      {step.parallel ? (
        <ul className={cx("mt-2.5 grid gap-1.5", step.parallel.length === 3 ? "grid-cols-3" : "grid-cols-2")} aria-label="In parallel">
          {step.parallel.map((p) => (
            <li
              key={p}
              className="flex min-h-7 items-center justify-center rounded-md border border-rule bg-paper px-1 py-1 text-center text-[0.6875rem] font-semibold leading-tight text-ink-2"
            >
              {p}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DownArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 22" className="mx-auto block h-[1.375rem] w-3 text-mark-muted">
      <path d="M6 1v18M2 15l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ----------------------------- Reliability rules ----------------------------- */

const MODELS = ["gemini-3.6-flash", "gemini-3-flash-preview", "gemini-3.5-flash-lite"];

const RULES: { icon: ReactNode; title: string; body: ReactNode }[] = [
  {
    icon: <CodeIcon className="size-5" />,
    title: "Numbers come from code, words from the AI",
    body: "The model never outputs a count. It groups thread keys; code counts them, computes the week-over-week change and labels the trend with fixed rules.",
  },
  {
    icon: <SparkleIcon className="size-5" />,
    title: "A model fallback chain",
    body: (
      <>
        <span className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {MODELS.map((m, i) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              {i > 0 ? (
                <>
                  <span aria-hidden="true" className="text-ink-3">
                    →
                  </span>
                  <span className="sr-only">then</span>
                </>
              ) : null}
              <code className="rounded-md bg-sunk px-1.5 py-0.5 font-mono text-xs text-ink">{m}</code>
            </span>
          ))}
        </span>
        Rate limits, server errors, timeouts and invalid JSON move on to the next model; configuration errors (400/401/403) fail fast. Replies
        must be schema-valid JSON.
      </>
    ),
  },
  {
    icon: <ShieldIcon className="size-5" />,
    title: "Every citation is checked",
    body: "Cited threads must exist in the collected data and fall in the right week; quotes must appear word for word in the post. Anything else is dropped and counted in the brief’s quality panel.",
  },
  {
    icon: <AlertIcon className="size-5" />,
    title: "A brief even when something breaks",
    body: "If Gemini is unavailable, the brief is built from keyword signals instead and says so at the top. A failing community is isolated: the brief is marked partial and names it, rather than failing.",
  },
  {
    icon: <MessageIcon className="size-5" />,
    title: "Prompt-injection safe",
    body: "Posts reach the model as delimited, untrusted data with a standing rule never to follow instructions inside them. Output is schema-constrained, so injected text cannot change its shape, and citations are re-checked.",
  },
  {
    icon: <DatabaseIcon className="size-5" />,
    title: "Read-only by default",
    body: "Supabase row-level security lets the website’s key only read. Writes go through token-gated database functions (only the token’s SHA-256 is stored). Manual runs need a passcode and have a cooldown; the cron route needs its secret.",
  },
];

export function ReliabilityRules() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {RULES.map((r) => (
        <li key={r.title} className="card p-5">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-lg bg-sunk text-ink-2">
            {r.icon}
          </span>
          <h3 className="mt-3 font-semibold leading-snug text-ink">{r.title}</h3>
          <p className="mt-1.5 text-sm text-ink-2">{r.body}</p>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------- Data sources ----------------------------- */

const SOURCES: { slug: SourceSlug; name: string; api: string; what: string; signals: string }[] = [
  {
    slug: "hackernews",
    name: "Hacker News",
    api: "Algolia HN Search API",
    what: "Stories and comments, searched per keyword.",
    signals: "Points and comments.",
  },
  {
    slug: "stackoverflow",
    name: "Stack Overflow",
    api: "Stack Exchange API",
    what: "Recent questions in the configured tags.",
    signals: "Answers, views and accepted answers, which power “Open questions”.",
  },
  {
    slug: "devto",
    name: "DEV Community",
    api: "Forem API",
    what: "Recent articles in the configured tags.",
    signals: "Reactions and comments.",
  },
];

export function DataSources() {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {SOURCES.map((s) => (
        <div key={s.slug} className="card p-5">
          <div className="flex items-center gap-2">
            <SourceGlyph source={s.slug} />
            <h3 className="font-semibold text-ink">{s.name}</h3>
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-ink-3">{s.api}</p>
          <p className="mt-3 text-sm text-ink-2">{s.what}</p>
          <p className="mt-1.5 text-sm text-ink-2">
            <span className="font-medium text-ink">Signals:</span> {s.signals}
          </p>
        </div>
      ))}
      <div className="rounded-2xl border border-dashed border-rule-strong p-5">
        <div className="flex items-center gap-2">
          <XCircleIcon className="size-5 text-ink-3" />
          <h3 className="font-semibold text-ink">Not monitored</h3>
        </div>
        <p className="mt-3 text-sm text-ink-2">
          <span className="font-medium text-ink">Reddit</span> answers server requests without credentials with HTTP 403, and new API apps
          need Reddit’s approval.
        </p>
        <p className="mt-2 text-sm text-ink-2">
          <span className="font-medium text-ink">X and Discord</span> need paid or privileged API access.
        </p>
        <p className="mt-2 text-sm text-ink-3">Sources are pluggable, so one can be added later without touching the rest of the pipeline.</p>
      </div>
    </div>
  );
}
