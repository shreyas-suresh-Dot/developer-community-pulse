import type { ReactNode } from "react";
import type { DataErrorKind } from "@/lib/data";
import { cx } from "./cx";
import { AlertIcon, InfoIcon } from "./icons";

/*
 * Honest states: an empty section says why it is empty, and a failed read explains what went wrong and
 * what to try, instead of a blank page or a stack trace.
 */

/** Short, honest message for a section with nothing to show. */
export function EmptyNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("flex items-start gap-2.5 rounded-xl bg-sunk px-4 py-3 text-sm text-ink-2", className)}>
      <InfoIcon className="mt-0.5 size-4 text-ink-3" />
      <span>{children}</span>
    </p>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn";
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const warn = tone === "warn";
  return (
    <div
      role={warn ? "note" : undefined}
      className={cx(
        "flex gap-3 rounded-xl border px-4 py-3.5 text-sm sm:px-5",
        warn ? "border-warn/30 bg-warn-tint text-ink" : "border-accent/25 bg-accent-tint/60 text-ink",
        className,
      )}
    >
      {warn ? <AlertIcon className="mt-0.5 size-[1.125rem] text-warn" /> : <InfoIcon className="mt-0.5 size-[1.125rem] text-accent" />}
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{title}</p>
        <div className="text-ink-2 [&_a]:font-medium">{children}</div>
      </div>
    </div>
  );
}

const ERROR_HINTS: Record<DataErrorKind, string> = {
  "not-configured": "The app is missing its Supabase settings. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the environment and redeploy.",
  unreachable: "Supabase did not answer as expected. This is usually temporary: reload the page in a minute.",
  invalid: "A stored row does not match the format this page expects, so it is not shown rather than shown wrong. Re-running the pipeline for that week rewrites it.",
};

/** Friendly box for a failed data read (see DataError in lib/data.ts). */
export function ErrorBox({ title, kind, message }: { title: string; kind: DataErrorKind; message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/30 bg-bad-tint px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex gap-3">
        <AlertIcon className="mt-0.5 size-5 text-bad" />
        <div className="min-w-0 space-y-1.5">
          <p className="font-semibold text-ink">{title}</p>
          <p className="text-sm text-ink-2">{ERROR_HINTS[kind]}</p>
          <p className="break-words font-mono text-xs text-ink-3">{message}</p>
        </div>
      </div>
    </div>
  );
}

/** Shimmering placeholder block for Suspense fallbacks. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("skeleton", className)} />;
}
