"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { rank } from "@/lib/format";
import { cx } from "./cx";

/*
 * "On this page" navigation that stays with the reader. Below xl it is a bar pinned to the top of the
 * screen that swipes sideways; from xl it is a vertical list beside the sections. The section whose
 * top has crossed the upper third of the screen is highlighted (aria-current), and at the very bottom
 * of the page the last section wins, so a short final section still lights up. A clicked link keeps
 * its highlight until the smooth scroll settles. Without JavaScript it is a plain list of anchors.
 */

export type NavSection = { id: string; label: string };

/** A clicked jump releases the highlight this long after the last scroll event. */
const SETTLE_MS = 150;
/** Release anyway when a click scrolls nothing (the section is already in place). */
const NO_SCROLL_MS = 1000;

export function SectionNav({ sections, label }: { sections: readonly NavSection[]; label: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const jumping = useRef(false);
  const releaseTimer = useRef<number | undefined>(undefined);
  const [active, setActive] = useState<string | null>(null);
  const idKey = sections.map((s) => s.id).join(" ");

  useEffect(() => {
    const ids = idKey.split(" ");
    let frame = 0;

    const update = () => {
      frame = 0;
      if (!jumping.current) setActive(currentSection(ids));
    };
    const schedule = () => {
      if (jumping.current) {
        window.clearTimeout(releaseTimer.current);
        releaseTimer.current = window.setTimeout(() => (jumping.current = false), SETTLE_MS);
        return;
      }
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    // Sections that stream in or expand move the ones below them without any scroll.
    const resizes = new ResizeObserver(schedule);
    resizes.observe(document.body);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resizes.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(releaseTimer.current);
      jumping.current = false;
    };
  }, [idKey]);

  // On the swipe bar, keep the highlighted link in view. The vertical list never overflows sideways.
  useEffect(() => {
    const list = listRef.current;
    if (!active || !list || list.scrollWidth <= list.clientWidth) return;
    const link = list.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!link) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({
      left: Math.max(0, link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [active]);

  function onJump(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    jumping.current = true;
    setActive(id);
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(() => (jumping.current = false), NO_SCROLL_MS);
  }

  return (
    <nav
      data-section-nav=""
      aria-label={label}
      className={cx(
        "sticky top-0 z-30 -mx-4 mb-8 border-b border-rule bg-paper/90 backdrop-blur-md sm:-mx-6",
        "xl:top-8 xl:mx-0 xl:mb-0 xl:self-start xl:border-b-0 xl:bg-transparent xl:backdrop-blur-none",
      )}
    >
      <p aria-hidden="true" className="hidden pb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3 xl:block">
        On this page
      </p>
      <ul
        ref={listRef}
        className={cx(
          "relative flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden",
          "xl:flex-col xl:gap-0 xl:overflow-visible xl:border-l xl:border-rule xl:p-0",
        )}
      >
        {sections.map((s, i) => {
          const current = s.id === active;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                data-section={s.id}
                aria-current={current ? "location" : undefined}
                onClick={(event) => onJump(event, s.id)}
                // The pinned bar sits inside the top 4rem that html's scroll-padding reserves; shifting each
                // chip's scroll box by the same amount stops focusing a chip from nudging the page.
                className={cx(
                  "flex -scroll-mt-16 scroll-mb-16 items-baseline gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors",
                  "xl:-ml-px xl:scroll-mt-0 xl:scroll-mb-0 xl:whitespace-normal xl:rounded-none xl:border-0 xl:border-l-2 xl:py-1.5 xl:pl-4 xl:pr-0",
                  current
                    ? "border-accent/40 bg-accent-tint font-semibold text-ink xl:border-accent xl:bg-transparent"
                    : "border-rule text-ink-2 hover:border-rule-strong hover:text-ink xl:border-transparent",
                )}
              >
                <span aria-hidden="true" className="hidden font-serif text-[0.8125rem] italic tabular-nums text-ink-3 xl:inline">
                  {rank(i)}
                </span>
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The last section whose top has crossed the reading line, or the last section at the page bottom. */
function currentSection(ids: readonly string[]): string | null {
  const sections = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
  if (sections.length === 0) return null;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (maxScroll > 4 && window.scrollY >= maxScroll - 4) return sections[sections.length - 1].id;
  const line = Math.max(window.innerHeight * 0.3, 120);
  let current: string | null = null;
  for (const section of sections) {
    if (section.getBoundingClientRect().top > line) break;
    current = section.id;
  }
  return current;
}
