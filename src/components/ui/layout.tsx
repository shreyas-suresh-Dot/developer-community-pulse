import type { ReactNode } from "react";
import { cx } from "./cx";
import { SectionNav, type NavSection } from "./section-nav";

/* Page-level building blocks shared by every route: the intro block and numbered brief sections. */

/** Two columns from xl up: the "On this page" rail, then the sections. Shared with the brief skeleton. */
export const RAIL_GRID = "xl:grid xl:grid-cols-[11rem_minmax(0,1fr)] xl:gap-x-12";

/** Numbered sections with a sticky "On this page" menu: a rail on desktop, a swipe bar on phones. */
export function SectionsWithNav({ sections, label, children }: { sections: readonly NavSection[]; label: string; children: ReactNode }) {
  return (
    <div className={RAIL_GRID}>
      <SectionNav sections={sections} label={label} />
      <div className="min-w-0 space-y-14 sm:space-y-16">{children}</div>
    </div>
  );
}

export function PageIntro({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <p className="kicker">{kicker}</p>
      <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">{title}</h1>
      {children ? <div className="mt-4 text-lg leading-relaxed text-ink-2">{children}</div> : null}
    </header>
  );
}

export function Section({
  id,
  index,
  title,
  intro,
  children,
  className,
}: {
  id: string;
  index?: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cx("scroll-mt-20 border-t border-rule pt-8 sm:pt-10 xl:scroll-mt-8", className)}>
      <header className="mb-6 grid gap-x-5 gap-y-1 sm:grid-cols-[3rem_1fr]">
        {index ? (
          <span aria-hidden="true" className="font-serif text-lg italic leading-9 text-accent sm:text-xl">
            {index}
          </span>
        ) : (
          <span aria-hidden="true" className="hidden sm:block" />
        )}
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-serif text-[1.75rem] font-medium leading-tight tracking-tight sm:text-3xl">
            {title}
          </h2>
          {intro ? <p className="mt-2 max-w-2xl text-ink-2">{intro}</p> : null}
        </div>
      </header>
      <div className="sm:pl-[4.25rem]">{children}</div>
    </section>
  );
}

export function SubHeading({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-ink-2">
      {icon}
      {children}
    </h3>
  );
}
