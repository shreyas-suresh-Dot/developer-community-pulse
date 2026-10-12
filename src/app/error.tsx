"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertIcon } from "@/components/ui/icons";

/*
 * Last-resort boundary for unexpected errors (expected data problems are rendered in place as an
 * ErrorBox). Production hides server error messages, so only the digest is shown for log lookup.
 */

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section aria-labelledby="error-title" className="mx-auto max-w-2xl py-6 sm:py-12">
      <p className="kicker">Something went wrong</p>
      <h1 id="error-title" className="mt-3 font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
        This page could not be shown
      </h1>
      <div className="mt-6 flex gap-3 rounded-2xl border border-bad/30 bg-bad-tint px-5 py-4">
        <AlertIcon className="mt-0.5 size-5 text-bad" />
        <div className="min-w-0 space-y-1 text-sm text-ink-2">
          <p>An unexpected error interrupted this page. Trying again usually works; the weekly brief itself is stored safely.</p>
          {error.digest ? (
            <p className="font-mono text-xs text-ink-3">
              Reference: <span className="break-all">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-rule-strong px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-sunk"
        >
          Go to this week’s brief
        </Link>
      </div>
    </section>
  );
}
