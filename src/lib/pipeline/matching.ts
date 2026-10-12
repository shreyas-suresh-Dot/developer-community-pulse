import type { PulseConfig, Week } from "../contracts";
import { weekIndexOf } from "../weeks";
import { excerptAround } from "./sources/text";
import type { MatchedMention, MatchResult, Matcher, RawMention } from "./types";

/*
 * Match step: the only code that decides whether a post counts, so it is pure and deterministic.
 * A keyword matches case-insensitively as a whole word or phrase, tolerant of a plural s/es and of
 * space / hyphen / underscore / no-space spellings ("code review" = "code-review" = "codereview");
 * a "/" inside a keyword accepts the same spellings ("CI/CD" = "CI-CD" = "cicd"). Boundaries are
 * Unicode-aware lookarounds rather than \b, which breaks on "CI/CD", accents and non-Latin text.
 * Keywords flagged requires_context count only when an active context term appears in the post or
 * in its context text (an HN comment's story title); keywords themselves only match the post.
 */

const SEPARATORS = /([\s_\-/]+)/;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const ENDS_WITH_LETTER = new RegExp("\\p{L}$", "u");

export function keywordRegex(keyword: string): RegExp {
  const trimmed = keyword.trim();
  let pattern = "";
  for (const part of trimmed.split(SEPARATORS)) {
    if (!part) continue;
    if (SEPARATORS.test(part)) pattern += part.includes("/") ? "[\\s_/-]*" : "[\\s_-]*";
    else pattern += part.replace(REGEX_SPECIALS, "\\$&");
  }
  const plural = ENDS_WITH_LETTER.test(trimmed) ? "(?:s|es)?" : "";
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}${plural}(?![\\p{L}\\p{N}])`, "iu");
}

export type PulseMatcher = Matcher & {
  /** Position of the earliest hit of any of `keywords` in `text`, or null. */
  firstHit(text: string, keywords: readonly string[]): { index: number; length: number } | null;
};

type KeywordEntry = {
  keyword: string;
  regex: RegExp;
  /** The same keyword string may sit in several categories, each with its own requires_context flag. */
  targets: Array<{ category: string; requiresContext: boolean }>;
};

export function buildMatcher(config: PulseConfig): PulseMatcher {
  const byKeyword = new Map<string, KeywordEntry>();
  for (const category of config.categories) {
    for (const { keyword: raw, requiresContext } of category.keywords) {
      const keyword = raw.trim();
      if (!keyword) continue;
      let entry = byKeyword.get(keyword);
      if (!entry) {
        entry = { keyword, regex: keywordRegex(keyword), targets: [] };
        byKeyword.set(keyword, entry);
      }
      entry.targets.push({ category: category.slug, requiresContext });
    }
  }
  const entries = [...byKeyword.values()];
  const contextRegexes = config.contextTerms.map((t) => t.trim()).filter(Boolean).map(keywordRegex);
  const categoryOrder = new Map(config.categories.map((c, i) => [c.slug, i]));

  const hasContext = (mention: RawMention) =>
    contextRegexes.some((r) => r.test(mention.text) || (mention.contextText !== "" && r.test(mention.contextText)));

  function match(mention: RawMention): MatchResult {
    const keywords: string[] = [];
    const categories = new Set<string>();
    let rawHit = false;
    let context: boolean | null = null;
    for (const entry of entries) {
      if (!entry.regex.test(mention.text)) continue;
      rawHit = true;
      let counted = false;
      for (const target of entry.targets) {
        if (target.requiresContext) {
          context ??= hasContext(mention);
          if (!context) continue;
        }
        counted = true;
        categories.add(target.category);
      }
      if (counted) keywords.push(entry.keyword);
    }
    return {
      keywords,
      categories: [...categories].sort((a, b) => (categoryOrder.get(a) ?? 0) - (categoryOrder.get(b) ?? 0)),
      droppedNoContext: rawHit && keywords.length === 0,
    };
  }

  function firstHit(text: string, keywords: readonly string[]) {
    let best: { index: number; length: number } | null = null;
    for (const keyword of keywords) {
      const found = byKeyword.get(keyword)?.regex.exec(text);
      if (found && (best === null || found.index < best.index)) best = { index: found.index, length: found[0].length };
    }
    return best;
  }

  return { match, firstHit };
}

export type MatchSummary = {
  mentions: MatchedMention[];
  /** Posts whose only keyword hits needed a context term that was absent (not counted). */
  droppedNoContext: number;
  /** Posts dated outside the 4-week window (not counted). */
  outsideWindow: number;
};

/** A long comment's leading excerpt may not show why it matched; re-centre it on the first keyword hit. */
function focusedExcerpt(mention: RawMention, keywords: string[], matcher: PulseMatcher): string {
  if (mention.kind !== "comment") return mention.excerpt;
  const hit = matcher.firstHit(mention.text, keywords);
  if (!hit) return mention.excerpt;
  const found = mention.text.slice(hit.index, hit.index + hit.length).toLowerCase();
  return mention.excerpt.toLowerCase().includes(found) ? mention.excerpt : excerptAround(mention.text, hit.index);
}

/** Matches collected posts and assigns each counted one to its week (0 = oldest, 3 = the brief's week). */
export function matchMentions(raw: readonly RawMention[], matcher: PulseMatcher, weeks: Week[]): MatchSummary {
  const seen = new Set<string>();
  const mentions: MatchedMention[] = [];
  let droppedNoContext = 0;
  let outsideWindow = 0;
  for (const mention of raw) {
    const id = `${mention.source}:${mention.externalId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const weekIndex = weekIndexOf(weeks, new Date(mention.postedAt));
    if (weekIndex < 0) {
      outsideWindow++;
      continue;
    }
    const result = matcher.match(mention);
    if (result.droppedNoContext) droppedNoContext++;
    if (result.keywords.length === 0) continue;
    mentions.push({
      ...mention,
      excerpt: focusedExcerpt(mention, result.keywords, matcher),
      matchedKeywords: result.keywords,
      matchedCategories: result.categories,
      weekIndex,
    });
  }
  return { mentions, droppedNoContext, outsideWindow };
}
