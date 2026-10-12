import { Suspense } from "react";
import { BriefSkeleton, BriefView, NoBriefYet } from "@/components/brief/brief-view";
import { ErrorBox } from "@/components/ui/notices";
import { getLatestBrief, settle } from "@/lib/data";

/*
 * Home: this week's brief. The masthead and skeleton are prerendered; the brief itself is read from
 * Supabase at request time inside <Suspense>, so a brief appears the moment the pipeline saves it.
 */

export default function HomePage() {
  return (
    <Suspense fallback={<BriefSkeleton label="Loading this week’s brief…" />}>
      <LatestBrief />
    </Suspense>
  );
}

async function LatestBrief() {
  const result = await settle(getLatestBrief());
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-4xl font-medium tracking-tight">This week’s brief</h1>
        <ErrorBox title="The latest brief could not be loaded" kind={result.error.kind} message={result.error.message} />
      </div>
    );
  }
  if (!result.data) return <NoBriefYet />;
  return <BriefView brief={result.data} />;
}
