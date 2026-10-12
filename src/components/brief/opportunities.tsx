import type { Analysis, Stats } from "@/lib/contracts";
import { plural } from "@/lib/format";
import { Badge } from "@/components/ui/badges";
import { EyeIcon, FlagIcon, LightbulbIcon, MessageIcon, QuestionIcon, TargetIcon } from "@/components/ui/icons";
import { Section, SubHeading } from "@/components/ui/layout";
import { EmptyNote } from "@/components/ui/notices";
import { EvidenceList, InlineEvidence, resolve } from "./evidence";
import { painPointAnchor } from "./pain-points";

/*
 * 04–07 · What to do with the week: unresolved and underserved problems, objections sales may hear,
 * sprint suggestions and the watchlist. These are AI-written; every thread they cite was checked by
 * code to exist. When the AI step did not run, each section says so instead of disappearing.
 */

const NO_AI = "The AI summary was unavailable this week, so this section could not be drafted. Counts and threads elsewhere on the page are unaffected.";

/* ----------------------------- 04 · Unresolved & underserved ----------------------------- */

export function UnresolvedSection({ index, analysis, stats }: { index: string; analysis: Analysis | null; stats: Stats }) {
  const evidence = analysis?.evidence ?? {};
  const underserved = analysis?.underserved ?? [];
  const flagged = (analysis?.painPoints ?? []).filter((p) => p.unresolved);
  const fallback = analysis?.mode === "fallback";

  return (
    <Section
      id="unresolved"
      index={index}
      title="Unresolved & underserved"
      intro="Problems developers keep raising without a good answer or tool: where a product could earn attention. Each one links to the threads it is based on."
    >
      <div className="space-y-8">
        {flagged.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-2">
            <FlagIcon className="size-4 text-warn" />
            <span className="font-medium text-ink">Flagged unresolved above:</span>
            {flagged.map((p, i) => (
              <span key={p.id || i}>
                <a href={`#${painPointAnchor(p.id || String(i + 1))}`} className="link">
                  {p.title}
                </a>
                {i < flagged.length - 1 ? <span aria-hidden="true"> · </span> : null}
              </span>
            ))}
          </p>
        ) : null}

        {!analysis ? (
          <EmptyNote>{NO_AI}</EmptyNote>
        ) : underserved.length === 0 ? (
          <EmptyNote>No clearly underserved problem stood out this week, so none is listed.</EmptyNote>
        ) : (
          <ul className="space-y-4">
            {underserved.map((u, i) => (
              <li key={i} className="card grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
                <div className="min-w-0">
                  <h3 className="font-serif text-xl font-medium leading-snug tracking-tight sm:text-[1.375rem]">{u.problem}</h3>
                  <p className="mt-2 text-ink-2">{u.whyUnderserved}</p>
                  <div className="mt-3">
                    <InlineEvidence threads={resolve(u.threadKeys, evidence)} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl bg-accent-tint/60 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-accent-strong">
                      <LightbulbIcon className="size-4" />
                      Opportunity
                    </p>
                    <p className="mt-1.5 text-sm text-ink">{u.opportunity}</p>
                  </div>
                  {u.toolsMentioned.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-ink-3">Tools mentioned</p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {u.toolsMentioned.map((tool) => (
                          <li key={tool}>
                            <Badge tone="neutral">{tool}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {fallback && underserved.length > 0 ? (
          <p className="text-sm text-ink-3">Without the AI summary, open Stack Overflow questions stand in as underserved candidates.</p>
        ) : null}

        <div>
          <SubHeading icon={<QuestionIcon className="size-4 text-ink-3" />}>Open questions on Stack Overflow</SubHeading>
          <p className="mt-1 text-sm text-ink-2">
            {stats.unanswered.length > 0
              ? `${plural(stats.unanswered.length, "question")} from this week still without an accepted answer, most viewed first.`
              : "Every Stack Overflow question matched this week already has an accepted answer, or none was matched."}
          </p>
          {stats.unanswered.length > 0 ? (
            <div className="mt-4">
              <EvidenceList threads={stats.unanswered} visible={5} label="question" />
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

/* ----------------------------- 05 · Objections ----------------------------- */

export function ObjectionsSection({ index, analysis }: { index: string; analysis: Analysis | null }) {
  const objections = analysis?.objections ?? [];
  const evidence = analysis?.evidence ?? {};
  return (
    <Section
      id="objections"
      index={index}
      title="Objections your sales team may hear"
      intro="Doubts developers voiced this week about tools like ours, with the context to answer them. Worth forwarding to sales as-is."
    >
      {!analysis || analysis.mode === "fallback" ? (
        <EmptyNote>{NO_AI}</EmptyNote>
      ) : objections.length === 0 ? (
        <EmptyNote>No recurring objection to review tooling came up in this week’s threads.</EmptyNote>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {objections.map((o, i) => (
            <li key={i} className="card flex flex-col p-5">
              <MessageIcon className="size-5 text-accent" />
              <p className="mt-3 font-serif text-xl leading-snug tracking-tight text-ink">“{o.objection}”</p>
              <p className="mt-3 text-sm text-ink-2">{o.context}</p>
              <div className="mt-auto pt-4">
                <InlineEvidence threads={resolve(o.threadKeys, evidence)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------- 06 · Sprint planning ----------------------------- */

export function SprintSection({ index, analysis }: { index: string; analysis: Analysis | null }) {
  const suggestions = analysis?.sprintSuggestions ?? [];
  const points = new Map((analysis?.painPoints ?? []).map((p, i) => [p.id, { title: p.title, anchor: painPointAnchor(p.id || String(i + 1)) }]));
  return (
    <Section
      id="sprint"
      index={index}
      title="For Monday’s sprint planning"
      intro="Candidate work items that follow from this week’s pain points: a starting point for discussion, not a roadmap."
    >
      {!analysis || analysis.mode === "fallback" ? (
        <EmptyNote>{NO_AI}</EmptyNote>
      ) : suggestions.length === 0 ? (
        <EmptyNote>No sprint suggestion this week: nothing in the threads was specific enough to act on.</EmptyNote>
      ) : (
        <ol className="divide-y divide-rule border-y border-rule">
          {suggestions.map((s, i) => {
            const linked = s.painPointIds.map((id) => points.get(id)).filter((p) => p !== undefined);
            return (
              <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 py-5 sm:grid-cols-[3rem_minmax(0,1fr)]">
                <span aria-hidden="true" className="font-serif text-2xl italic leading-tight text-accent">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-snug text-ink">{s.suggestion}</h3>
                  <p className="mt-1.5 max-w-3xl text-ink-2">{s.rationale}</p>
                  {linked.length > 0 ? (
                    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                      <TargetIcon className="size-4 text-ink-3" />
                      <span className="text-ink-3">Addresses</span>
                      {linked.map((p, j) => (
                        <a
                          key={j}
                          href={`#${p.anchor}`}
                          className="rounded-md border border-rule bg-surface px-2 py-0.5 text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
                        >
                          {p.title}
                        </a>
                      ))}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

/* ----------------------------- 07 · Watchlist ----------------------------- */

export function WatchlistSection({ index, analysis }: { index: string; analysis: Analysis | null }) {
  const items = analysis?.watchlist ?? [];
  const evidence = analysis?.evidence ?? {};
  return (
    <Section
      id="watchlist"
      index={index}
      title="Watchlist"
      intro="Early signals that are not trends yet: worth a look again next Friday."
    >
      {!analysis ? (
        <EmptyNote>{NO_AI}</EmptyNote>
      ) : items.length === 0 ? (
        <EmptyNote>Nothing new to watch this week.</EmptyNote>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((w, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-rule bg-surface p-4">
              <EyeIcon className="mt-0.5 size-5 text-ink-3" />
              <div className="min-w-0 space-y-2">
                <p className="text-ink">{w.signal}</p>
                <InlineEvidence threads={resolve(w.threadKeys, evidence)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
