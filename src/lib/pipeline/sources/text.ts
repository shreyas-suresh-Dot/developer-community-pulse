/*
 * Plain-text helpers shared by the source adapters. Hacker News and Stack Overflow return HTML with
 * entities; matching, excerpts and the AI all work on the same normalised single-line text, so a
 * keyword hidden behind `&#x27;` or a `<code>` tag is still found and quotes can be checked verbatim.
 */

export const EXCERPT_MAX = 500;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  deg: "°",
  euro: "€",
  pound: "£",
  rarr: "→",
  larr: "←",
  zwj: "‍",
  zwnj: "‌",
};

/** Inline tags are removed without a space ("un<b>clear</b>" stays one word); every other tag separates words. */
const INLINE_TAGS = new Set(["a", "abbr", "b", "code", "em", "i", "kbd", "mark", "s", "small", "span", "strong", "sub", "sup", "u"]);

function codePointToString(code: number): string | null {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
  return String.fromCodePoint(code);
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const decoded = codePointToString(Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
      return decoded ?? "�";
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/** HTML fragment → one line of plain text: drops script/style/comments, strips tags, decodes entities. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const withoutBlocks = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const withoutTags = withoutBlocks.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_tag, name: string) =>
    INLINE_TAGS.has(name.toLowerCase()) ? "" : " ",
  );
  return collapseWhitespace(decodeEntities(withoutTags));
}

/**
 * Joins the parts of a post (title, body, tags…) for matching. The em-dash separator is deliberately
 * not whitespace/hyphen/underscore, so a multi-word keyword cannot match across two parts
 * (title "…code" + body "Review…" is not "code review").
 */
export function joinText(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => collapseWhitespace(part ?? ""))
    .filter((part) => part.length > 0)
    .join(" — ");
}

/** First `max` characters, cut at a word boundary when possible, with "…" when truncated (result ≤ max). */
export function excerpt(text: string, max: number = EXCERPT_MAX): string {
  const clean = collapseWhitespace(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace >= Math.floor(max * 0.6) ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

/**
 * An excerpt that shows the text around `index` (e.g. the first keyword hit) when the hit lies beyond
 * what a plain leading excerpt would show. Result ≤ max characters, "…"-marked on cut sides.
 */
export function excerptAround(text: string, index: number, max: number = EXCERPT_MAX): string {
  if (text.length <= max || index < Math.floor(max * 0.6)) return excerpt(text, max);
  let start = Math.max(0, index - Math.floor(max * 0.3));
  const space = text.indexOf(" ", start);
  if (space !== -1 && space < index) start = space + 1;
  if (start === 0) return excerpt(text, max);
  return `…${excerpt(text.slice(start), max - 1)}`;
}
