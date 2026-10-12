import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavList } from "./nav-links";

/* Masthead and footer shared by every page. Both are static, so they ship in the prerendered shell. */

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M6 17h5l2.5-6.5L18 23l3-6h5"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="group flex items-center gap-2.5 rounded-lg" aria-label="Community Pulse, this week's brief">
          <LogoMark />
          <span className="flex flex-col leading-none">
            <span className="font-serif text-[1.375rem] font-semibold tracking-tight">Community Pulse</span>
            <span className="mt-1 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-ink-3">Weekly developer intelligence</span>
          </span>
        </Link>
        <Suspense fallback={<NavList active={null} />}>
          <NavLinks />
        </Suspense>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-rule">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-ink-3 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl">
          Sources: Hacker News · Stack Overflow · DEV — numbers computed by code, summaries by Gemini, every claim linked to its
          thread.
        </p>
        <p className="flex items-center gap-2 whitespace-nowrap">
          <LogoMark className="size-4" />
          New brief every Friday, 07:00 IST
        </p>
      </div>
    </footer>
  );
}
