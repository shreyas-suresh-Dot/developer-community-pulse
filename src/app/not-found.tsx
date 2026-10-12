import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <section aria-labelledby="not-found-title" className="mx-auto max-w-2xl py-6 sm:py-12">
      <p className="kicker">404 · Not found</p>
      <h1 id="not-found-title" className="mt-3 font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
        There is no brief here
      </h1>
      <p className="mt-4 text-lg text-ink-2">
        Briefs live at <code className="rounded bg-sunk px-1.5 py-0.5 font-mono text-base">/briefs/YYYY-MM-DD</code>, where the date is the
        Friday the week ends on. The page may also be for a week that has not been generated yet.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong"
        >
          This week’s brief
          <ArrowRightIcon className="size-4" />
        </Link>
        <Link
          href="/briefs"
          className="inline-flex items-center gap-2 rounded-lg border border-rule-strong px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-sunk"
        >
          Browse the archive
        </Link>
      </div>
    </section>
  );
}
