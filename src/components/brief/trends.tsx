import { TREND_LABELS, type CategoryStat, type KeywordStat, type Stats } from "@/lib/contracts";
import { changeShort, formatCount, percent, plural, TREND_COPY } from "@/lib/format";
import { CategoryChip, TrendBadge } from "@/components/ui/badges";
import { Section, SubHeading } from "@/components/ui/layout";
import { ArrowUpRightIcon } from "@/components/ui/icons";
import { EmptyNote } from "@/components/ui/notices";
import { Sparkline } from "@/components/ui/sparkline";

/*
 * 02 · Trending topics and 03 · Keyword pulse. Everything here is deterministic: matched posts and
 * distinct threads per week, counted by code over a four-week window, with the week-over-week trend
 * label from pipeline/trend.ts. The AI only contributes the per-category relevance check.
 */

const KEYWORDS_VISIBLE = 10;

export function TrendingSection({ index, stats }: { index: string; stats: Stats }) {
  const labels = stats.weeks.map((w) => w.label);
  const categories = stats.categories;

  return (
    <Section
      id="trending"
      index={index}
      title="Trending topics"
      intro="Distinct threads per monitored category, this week against last week, with the four-week line for context. Counted by code from matched posts."
    >
      {categories.length === 0 ? (
        <EmptyNote>No category had a matching thread in the last four weeks. Check the topic configuration if this persists.</EmptyNote>
      ) : (
        <div className="card px-4 py-3 sm:px-6 sm:py-4">
          <table className="data-table">
            <caption className="sr-only">Threads per category over the last four weeks, sorted by this week</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">4 weeks</th>
                <th scope="col" className="num">
                  This week
                </th>
                <th scope="col" className="num">
                  Last week
                </th>
                <th scope="col" className="num">
                  Change
                </th>
                <th scope="col">Trend</th>
                <th scope="col">AI relevance check</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <CategoryRow key={c.slug} category={c} labels={labels} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TrendLegend />
    </Section>
  );
}

function CategoryRow({ category: c, labels }: { category: CategoryStat; labels: string[] }) {
  return (
    <tr>
      <th scope="row" className="min-w-[11rem] text-[0.9375rem]">
        {c.name}
      </th>
      <td data-label="Last 4 weeks" className="wide">
        <Sparkline values={c.threads} labels={labels} unit="threads" />
      </td>
      <td data-label="This week" className="num text-base font-semibold text-ink">
        {formatCount(c.threads[3])}
      </td>
      <td data-label="Last week" className="num text-ink-3">
        {formatCount(c.threads[2])}
      </td>
      <td data-label="Change" className="num whitespace-nowrap text-sm text-ink-2">
        {changeShort(c.change)}
      </td>
      <td data-label="Trend">
        <TrendBadge trend={c.change.trend} />
      </td>
      <td data-label="AI relevance check" className="wide">
        <Relevance verified={c.verified} />
      </td>
    </tr>
  );
}

function Relevance({ verified }: { verified: CategoryStat["verified"] }) {
  if (verified === null) return <span className="text-sm text-ink-3">Not checked</span>;
  const pct = percent(verified.relevant, verified.checked);
  if (pct === null) return <span className="text-sm text-ink-3">Nothing to check</span>;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2" title={`${pct}% of the checked threads were judged on-topic`}>
      <span aria-hidden="true" className="h-1.5 w-10 overflow-hidden rounded-full bg-accent-tint">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="whitespace-nowrap">
        {formatCount(verified.relevant)} of {formatCount(verified.checked)} on-topic
      </span>
    </span>
  );
}

/** The trend rules, so a "Rising" label can always be checked against the numbers next to it. */
export function TrendLegend() {
  return (
    <details className="disclosure mt-4 text-sm">
      <summary className="rounded font-medium text-ink-2 hover:text-ink">How trend labels are decided</summary>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {TREND_LABELS.map((t) => (
          <li key={t} className="flex flex-wrap items-center gap-2">
            <TrendBadge trend={t} />
            <span className="text-ink-2">{TREND_COPY[t].rule}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ----------------------------- 03 · Keyword pulse ----------------------------- */

export function KeywordsSection({ index, stats }: { index: string; stats: Stats }) {
  const labels = stats.weeks.map((w) => w.label);
  const names = new Map(stats.categories.map((c) => [c.slug, c.name]));
  const keywords = stats.keywords;

  const risers = keywords
    .filter((k) => k.change.abs > 0 && (k.change.trend === "rising" || k.change.trend === "new"))
    .sort((a, b) => b.change.abs - a.change.abs || b.change.current - a.change.current)
    .slice(0, 3);
  const fallers = keywords
    .filter((k) => k.change.trend === "falling")
    .sort((a, b) => a.change.abs - b.change.abs)
    .slice(0, 1);
  const movers = [...risers, ...fallers];
  const moverSet = new Set(movers.map((k) => k.keyword));
  const example = keywords.find((k) => k.keyword.toLowerCase() === "false positive rate") ?? risers[0] ?? keywords[0];

  const visible = keywords.slice(0, KEYWORDS_VISIBLE);
  const rest = keywords.slice(KEYWORDS_VISIBLE);

  return (
    <Section
      id="keywords"
      index={index}
      title="Keyword pulse"
      intro={
        <>
          Is “false positive rate” 4 mentions or 14, and is it growing? Matching posts per week for every monitored keyword with any
          activity in the last four weeks, counted by code.
        </>
      }
    >
      {keywords.length === 0 ? (
        <EmptyNote>No monitored keyword was mentioned in the last four weeks.</EmptyNote>
      ) : (
        <div className="space-y-8">
          {example ? <KeywordAnswer keyword={example} /> : null}

          <div>
            <SubHeading icon={<ArrowUpRightIcon className="size-4 text-accent" />}>Biggest movers</SubHeading>
            {movers.length === 0 ? (
              <EmptyNote className="mt-3">
                No keyword moved enough to call a trend this week (at least ±25% and ±3 mentions), so none is highlighted.
              </EmptyNote>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {movers.map((k) => (
                  <MoverCard key={k.keyword} keyword={k} category={names.get(k.category) ?? k.category} labels={labels} />
                ))}
              </ul>
            )}
          </div>

          <div className="card px-4 py-3 sm:px-6 sm:py-4">
            <KeywordTable keywords={visible} names={names} labels={labels} movers={moverSet} caption="Mentions per keyword, most mentioned first" />
            {rest.length > 0 ? (
              <details className="disclosure border-t border-rule py-3">
                <summary className="rounded text-sm font-medium text-ink-2 hover:text-ink">
                  Show {plural(rest.length, "more keyword")}
                </summary>
                <div className="mt-2">
                  <KeywordTable keywords={rest} names={names} labels={labels} movers={moverSet} caption="Remaining keywords" />
                </div>
              </details>
            ) : null}
          </div>
        </div>
      )}
    </Section>
  );
}

/** One sentence that answers the Friday question for a concrete keyword, straight from the counts. */
function KeywordAnswer({ keyword: k }: { keyword: KeywordStat }) {
  const [w0, w1, w2, w3] = k.mentions;
  const earlier = Math.max(w0, w1, w2);
  const context =
    w3 > earlier ? "the highest of the four weeks" : w3 < Math.min(w0, w1, w2) ? "the lowest of the four weeks" : null;
  const direction = k.change.abs > 0 ? "up from" : k.change.abs < 0 ? "down from" : "the same as";
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-rule bg-surface px-4 py-3 text-[0.9375rem] text-ink-2">
      <span>
        This week <strong className="font-semibold text-ink">“{k.keyword}”</strong> had{" "}
        <strong className="font-semibold text-ink">{plural(k.change.current, "mention")}</strong>, {direction}{" "}
        {formatCount(k.change.previous)} last week{context ? `, ${context}` : ""}.
      </span>
      <TrendBadge trend={k.change.trend} />
    </p>
  );
}

function MoverCard({ keyword: k, category, labels }: { keyword: KeywordStat; category: string; labels: string[] }) {
  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-3">{category}</p>
        <p className="mt-0.5 font-semibold leading-snug text-ink">“{k.keyword}”</p>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="leading-none">
          <span className="text-[1.75rem] font-semibold tabular-nums text-ink">{formatCount(k.change.current)}</span>
          <span className="ml-1.5 text-sm text-ink-3">from {formatCount(k.change.previous)}</span>
        </p>
        <Sparkline values={k.mentions} labels={labels} unit="mentions" width={76} height={26} />
      </div>
      <p className="flex flex-wrap items-center gap-2">
        <TrendBadge trend={k.change.trend} />
        <span className="text-xs tabular-nums text-ink-3">{changeShort(k.change)}</span>
      </p>
    </li>
  );
}

function KeywordTable({
  keywords,
  names,
  labels,
  movers,
  caption,
}: {
  keywords: KeywordStat[];
  names: Map<string, string>;
  labels: string[];
  movers: Set<string>;
  caption: string;
}) {
  return (
    <table className="data-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Keyword</th>
          <th scope="col">Category</th>
          <th scope="col">4 weeks</th>
          <th scope="col" className="num">
            This week
          </th>
          <th scope="col" className="num">
            Last week
          </th>
          <th scope="col" className="num">
            Change
          </th>
          <th scope="col">Trend</th>
        </tr>
      </thead>
      <tbody>
        {keywords.map((k) => (
          <tr key={`${k.category}:${k.keyword}`}>
            <th scope="row" className="text-[0.9375rem]">
              {k.keyword}
              {movers.has(k.keyword) ? (
                <span className="ml-2 inline-block align-middle text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-accent">Mover</span>
              ) : null}
            </th>
            <td data-label="Category" className="wide">
              <CategoryChip>{names.get(k.category) ?? k.category}</CategoryChip>
            </td>
            <td data-label="Last 4 weeks" className="wide">
              <Sparkline values={k.mentions} labels={labels} unit="mentions" />
            </td>
            <td data-label="This week" className="num font-semibold text-ink">
              {formatCount(k.mentions[3])}
            </td>
            <td data-label="Last week" className="num text-ink-3">
              {formatCount(k.mentions[2])}
            </td>
            <td data-label="Change" className="num whitespace-nowrap text-sm text-ink-2">
              {changeShort(k.change)}
            </td>
            <td data-label="Trend">
              <TrendBadge trend={k.change.trend} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
