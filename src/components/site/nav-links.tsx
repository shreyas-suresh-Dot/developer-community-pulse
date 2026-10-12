"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

/*
 * Primary navigation. The active link needs the pathname, which is request data on dynamic routes,
 * so the header renders <NavList active={null}/> as the prerendered fallback and this swaps in.
 */

const LINKS = [
  { href: "/", label: "This week" },
  { href: "/briefs", label: "Archive" },
  { href: "/topics", label: "Topics" },
  { href: "/how-it-works", label: "How it works" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  const active = LINKS.find((l) => (l.href === "/" ? pathname === "/" : pathname === l.href || pathname.startsWith(`${l.href}/`)));
  return <NavList active={active?.href ?? null} />;
}

export function NavList({ active }: { active: string | null }) {
  return (
    <nav aria-label="Primary" className="-mx-2 overflow-x-auto sm:mx-0">
      <ul className="flex items-center gap-0.5 whitespace-nowrap text-[0.9375rem]">
        {LINKS.map((l) => {
          const isActive = l.href === active;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "relative block rounded-md px-2 py-1.5 transition-colors sm:px-3",
                  isActive ? "font-semibold text-ink" : "text-ink-2 hover:bg-sunk hover:text-ink",
                )}
              >
                {l.label}
                {isActive ? (
                  <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent sm:inset-x-3" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
