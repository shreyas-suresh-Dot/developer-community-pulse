import type { ReactNode } from "react";
import type { Analysis, BriefRecord, Delivery, RunRecord, RunStep, Trend } from "@/lib/contracts";
import { TREND_COPY } from "@/lib/format";
import { cx } from "./cx";
import {
  AlertIcon,
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  GlobeIcon,
  HalfCircleIcon,
  LoaderIcon,
  MailIcon,
  MinusIcon,
  SkipIcon,
  SparkleIcon,
  XCircleIcon,
} from "./icons";

/*
 * Status, trend and mode badges. Every badge pairs an icon with a text label, so meaning never rests on
 * colour alone; tones come from the shared tokens and are reserved for state, never for data series.
 */

export type Tone = "good" | "warn" | "bad" | "neutral" | "accent" | "accent-outline" | "quiet";

const TONES: Record<Tone, string> = {
  good: "bg-good-tint text-good",
  warn: "bg-warn-tint text-warn",
  bad: "bg-bad-tint text-bad",
  neutral: "bg-neutral-tint text-ink-2",
  accent: "bg-accent-tint text-accent-strong",
  "accent-outline": "border border-accent/50 text-accent-strong",
  quiet: "border border-rule-strong text-ink-3",
};

export function Badge({
  tone,
  icon,
  children,
  title,
  className,
}: {
  tone: Tone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium leading-5",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const TREND_STYLE: Record<Trend, { tone: Tone; icon: ReactNode }> = {
  rising: { tone: "accent", icon: <ArrowUpRightIcon className="size-3.5" /> },
  new: { tone: "accent-outline", icon: <SparkleIcon className="size-3.5" /> },
  steady: { tone: "neutral", icon: <ArrowRightIcon className="size-3.5" /> },
  falling: { tone: "neutral", icon: <ArrowDownRightIcon className="size-3.5" /> },
  quiet: { tone: "quiet", icon: <MinusIcon className="size-3.5" /> },
};

export function TrendBadge({ trend, className }: { trend: Trend; className?: string }) {
  const { tone, icon } = TREND_STYLE[trend];
  return (
    <Badge tone={tone} icon={icon} title={TREND_COPY[trend].rule} className={className}>
      {TREND_COPY[trend].label}
    </Badge>
  );
}

const STATUS: Record<BriefRecord["status"], { tone: Tone; label: string; icon: ReactNode; title: string }> = {
  complete: {
    tone: "good",
    label: "Complete",
    icon: <CheckCircleIcon className="size-3.5" />,
    title: "Every source responded and every step succeeded",
  },
  partial: {
    tone: "warn",
    label: "Partial",
    icon: <HalfCircleIcon className="size-3.5" />,
    title: "Published with gaps: a source or the AI step was unavailable",
  },
  failed: {
    tone: "bad",
    label: "Failed",
    icon: <XCircleIcon className="size-3.5" />,
    title: "The run could not produce a usable brief",
  },
};

export function StatusBadge({ status }: { status: BriefRecord["status"] }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon} title={s.title}>
      {s.label}
    </Badge>
  );
}

export function RunStatusBadge({ status }: { status: RunRecord["status"] }) {
  if (status === "running") {
    return (
      <Badge tone="accent" icon={<LoaderIcon className="size-3.5" />}>
        Running
      </Badge>
    );
  }
  return <StatusBadge status={status} />;
}

export function DeliveryBadge({ delivery }: { delivery: Delivery }) {
  if (delivery.status === "sent") {
    const n = delivery.to.length;
    return (
      <Badge tone="good" icon={<MailIcon className="size-3.5" />} title={delivery.detail ?? undefined}>
        {n > 0 ? `Emailed to ${n} ${n === 1 ? "recipient" : "recipients"}` : "Emailed"}
      </Badge>
    );
  }
  if (delivery.status === "failed") {
    return (
      <Badge tone="bad" icon={<AlertIcon className="size-3.5" />} title={delivery.detail ?? undefined}>
        Email failed · on the web
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" icon={<GlobeIcon className="size-3.5" />} title={delivery.detail ?? undefined}>
      Web only
    </Badge>
  );
}

export function ModeBadge({ analysis }: { analysis: Analysis | null }) {
  return <AnalysisModeBadge mode={analysis?.mode ?? null} model={analysis?.model ?? null} />;
}

/** Same badge from just the mode, e.g. for archive rows that do not load the whole analysis. */
export function AnalysisModeBadge({ mode, model = null }: { mode: Analysis["mode"] | null; model?: string | null }) {
  if (mode === null) {
    return (
      <Badge tone="warn" icon={<AlertIcon className="size-3.5" />}>
        No AI analysis
      </Badge>
    );
  }
  if (mode === "fallback") {
    return (
      <Badge tone="warn" icon={<AlertIcon className="size-3.5" />} title="The AI step was unavailable; written from keyword matches only">
        Fallback · keyword-based
      </Badge>
    );
  }
  return (
    <Badge tone="accent" icon={<SparkleIcon className="size-3.5" />} title="Words by Gemini, every number and citation checked by code">
      AI-written{model ? ` · ${model}` : ""}
    </Badge>
  );
}

/** A monitored category's name, as a quiet chip next to a pain point or keyword. */
export function CategoryChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center rounded-md border border-rule bg-sunk px-2 py-0.5 text-xs font-medium leading-5 text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Whether a config row is used by the next run. */
export function ActiveBadge({ active, title }: { active: boolean; title?: string }) {
  return active ? (
    <Badge tone="good" icon={<CheckCircleIcon className="size-3.5" />} title={title}>
      Active
    </Badge>
  ) : (
    <Badge tone="quiet" icon={<SkipIcon className="size-3.5" />} title={title}>
      Paused
    </Badge>
  );
}

export function TriggerBadge({ trigger }: { trigger: RunRecord["trigger"] }) {
  const label = trigger === "cron" ? "Scheduled" : trigger === "manual" ? "Manual run" : "Backfill";
  return <Badge tone="quiet">{label}</Badge>;
}

const STEP: Record<RunStep["status"], { label: string; className: string; icon: (cls: string) => ReactNode }> = {
  ok: { label: "OK", className: "text-good", icon: (c) => <CheckCircleIcon className={c} /> },
  warning: { label: "Warning", className: "text-warn", icon: (c) => <AlertIcon className={c} /> },
  failed: { label: "Failed", className: "text-bad", icon: (c) => <XCircleIcon className={c} /> },
  skipped: { label: "Skipped", className: "text-ink-3", icon: (c) => <SkipIcon className={c} /> },
  running: { label: "Running", className: "text-accent", icon: (c) => <LoaderIcon className={c} /> },
};

/** Icon for one pipeline step; the label is announced to screen readers and shown on hover. */
export function StepStatusIcon({
  status,
  name,
  detail,
  className = "size-4",
}: {
  status: RunStep["status"];
  name?: string;
  /** Extra hover text, e.g. "21.5 s · 2,907 posts from 3 of 3 sources". */
  detail?: string;
  className?: string;
}) {
  const s = STEP[status];
  const label = name ? `${name}: ${s.label}` : s.label;
  return (
    <span className={cx("inline-flex", s.className)} title={detail ? `${label} · ${detail}` : label}>
      {s.icon(className)}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function stepLabel(status: RunStep["status"]): string {
  return STEP[status].label;
}
