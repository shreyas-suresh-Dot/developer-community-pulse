import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BriefSkeleton, BriefView } from "@/components/brief/brief-view";
import { ErrorBox } from "@/components/ui/notices";
import { getBrief, settle } from "@/lib/data";
import { isWeekEnd } from "@/lib/format";
import { formatFriday } from "@/lib/weeks";

/*
 * One archived brief, addressed by the Friday its week ends on (/briefs/2026-10-09). The param is
 * awaited and validated before anything streams, so a malformed date or a non-Friday gets a real 404
 * status; the brief itself is still read at request time inside <Suspense>.
 *
 * With Partial Prefetching, an unlisted param would otherwise get the route's shared App Shell first
 * (HTTP 200) and the not-found UI streamed after it. "blocking" makes Next render the URL-specific
 * shell before responding, and `instant = false` allows that shell to wait on the param.
 */

export const unstable_paramMatching = { weekEnd: "blocking" };
export const instant = false;

type Props = { params: Promise<{ weekEnd: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { weekEnd } = await params;
  if (!isWeekEnd(weekEnd)) return { title: "Brief not found" };
  return {
    title: `Week ending ${formatFriday(weekEnd)}`,
    description: `The Community Pulse brief for the week ending ${formatFriday(weekEnd)}: pain points, trends and unresolved problems in code review and CI/CD.`,
  };
}

export default async function BriefPage({ params }: Props) {
  const { weekEnd } = await params;
  if (!isWeekEnd(weekEnd)) notFound();

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/briefs" className="inline-flex items-center gap-1.5 rounded text-ink-2 hover:text-ink">
          <span aria-hidden="true">←</span> All briefs
        </Link>
      </nav>
      <Suspense fallback={<BriefSkeleton label={`Loading the brief for the week ending ${formatFriday(weekEnd)}…`} />}>
        <WeekBrief weekEnd={weekEnd} />
      </Suspense>
    </div>
  );
}

async function WeekBrief({ weekEnd }: { weekEnd: string }) {
  const result = await settle(getBrief(weekEnd));
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-4xl font-medium tracking-tight">Week ending {formatFriday(weekEnd)}</h1>
        <ErrorBox title="This brief could not be loaded" kind={result.error.kind} message={result.error.message} />
      </div>
    );
  }
  if (!result.data) notFound();
  return <BriefView brief={result.data} />;
}
