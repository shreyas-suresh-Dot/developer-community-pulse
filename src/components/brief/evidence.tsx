import type { SourceSlug, ThreadRef } from "@/lib/contracts";
import { engagementText, formatIstDayMonth, safeHref, sourceName } from "@/lib/format";
import { cx } from "@/components/ui/cx";
import { ExternalIcon } from "@/components/ui/icons";

/*
 * Evidence: every claim in a brief links to the community thread it came from. Links open in a new tab
 * with rel="noopener noreferrer", and only http(s) URLs are ever rendered as links.
 */

export type Evidence = Record<string, ThreadRef>;

const GLYPH: Record<SourceSlug, string> = { hackernews: "HN", stackoverflow: "SO", devto: "DEV" };

export function SourceGlyph({ source }: { source: SourceSlug }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 min-w-7 items-center justify-center rounded-[0.3rem] border border-rule-strong px-1 text-[0.625rem] font-semibold tracking-wide text-ink-2"
    >
      {GLYPH[source]}
    </span>
  );
}

export function ThreadLink({ thread, className }: { thread: ThreadRef; className?: string }) {
  const href = safeHref(thread.url);
  const title = thread.title.trim() || "Untitled thread";
  if (!href) return <span className={className}>{title}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx("link", className)}>
      {title}
      <ExternalIcon className="ml-1 inline size-3.5 align-[-0.125em] opacity-70" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function threadMeta(thread: ThreadRef): string {
  return [sourceName(thread.source), engagementText(thread.engagement), formatIstDayMonth(thread.postedAt)]
    .filter(Boolean)
    .join(" · ");
}

export function resolve(keys: readonly string[], evidence: Evidence): ThreadRef[] {
  const seen = new Set<string>();
  const out: ThreadRef[] = [];
  for (const key of keys) {
    const thread = evidence[key];
    if (thread && !seen.has(key)) {
      seen.add(key);
      out.push(thread);
    }
  }
  return out;
}

function EvidenceItem({ thread }: { thread: ThreadRef }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] items-start gap-x-2.5">
      <span className="pt-0.5">
        <SourceGlyph source={thread.source} />
      </span>
      <div className="min-w-0">
        <ThreadLink thread={thread} className="text-[0.9375rem] font-medium leading-snug" />
        <p className="mt-0.5 text-xs text-ink-3">{threadMeta(thread)}</p>
      </div>
    </li>
  );
}

/** Thread list with the first few visible and the rest behind a native disclosure. */
export function EvidenceList({ threads, visible = 3, label = "thread" }: { threads: ThreadRef[]; visible?: number; label?: string }) {
  if (threads.length === 0) return <p className="text-sm text-ink-3">No linked threads survived validation.</p>;
  const shown = threads.slice(0, visible);
  const rest = threads.slice(visible);
  return (
    <div>
      <ul className="space-y-3">
        {shown.map((t) => (
          <EvidenceItem key={t.threadKey} thread={t} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="disclosure mt-3">
          <summary className="rounded text-sm font-medium text-ink-2 hover:text-ink">
            Show {rest.length} more {rest.length === 1 ? label : `${label}s`}
          </summary>
          <ul className="mt-3 space-y-3">
            {rest.map((t) => (
              <EvidenceItem key={t.threadKey} thread={t} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** One-line "Seen in" citations for objections, watchlist items and underserved problems. */
export function InlineEvidence({ threads, lead = "Seen in" }: { threads: ThreadRef[]; lead?: string }) {
  if (threads.length === 0) return null;
  return (
    <p className="text-sm text-ink-3">
      <span className="font-medium text-ink-2">{lead}: </span>
      {threads.map((t, i) => (
        <span key={t.threadKey}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          <ThreadLink thread={t} />
          <span className="text-ink-3"> ({sourceName(t.source)})</span>
        </span>
      ))}
    </p>
  );
}
