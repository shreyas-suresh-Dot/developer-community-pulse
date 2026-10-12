import { describe, expect, it } from "vitest";
import { decodeEntities, excerpt, excerptAround, htmlToText, joinText } from "./text";

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("Tao&#x27;s &quot;CI&#47;CD&quot; &amp; more&hellip;")).toBe(`Tao's "CI/CD" & more…`);
    expect(decodeEntities("&#x2F;&#39;&nbsp;&mdash;&AMP;")).toBe("/' —&");
  });

  it("leaves unknown entities and replaces invalid code points", () => {
    expect(decodeEntities("&notanentity; &#0; &#xD800;")).toBe("&notanentity; � �");
  });
});

describe("htmlToText", () => {
  it("strips tags, keeps inline words whole, separates blocks and decodes after stripping", () => {
    const html = "I would say<p>1. use <i>pre-commit</i> hooks<p>2. see <a href=\"https:&#x2F;&#x2F;x.com\">https:&#x2F;&#x2F;x.com</a> &lt;div&gt;";
    expect(htmlToText(html)).toBe("I would say 1. use pre-commit hooks 2. see https://x.com <div>");
    expect(htmlToText("un<b>clear</b> code<br>review")).toBe("unclear code review");
  });

  it("drops scripts, styles and comments, and handles empty input", () => {
    expect(htmlToText("a<script>alert(1)</script><style>p{}</style><!-- hidden -->b")).toBe("a b");
    expect(htmlToText(null)).toBe("");
    expect(htmlToText("<pre><code>npm  run\n\tlint</code></pre>")).toBe("npm run lint");
  });
});

describe("joinText", () => {
  it("joins parts with a separator a multi-word keyword cannot span", () => {
    expect(joinText("Title about code", "  ", null, "Review body")).toBe("Title about code — Review body");
  });
});

describe("excerpt", () => {
  it("keeps short text and cuts long text at a word boundary within the limit", () => {
    expect(excerpt("short text")).toBe("short text");
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const cut = excerpt(long, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith("…")).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("excerptAround shows a late hit and stays within the limit", () => {
    const text = `${"filler ".repeat(150)}the false positive rate is awful ${"tail ".repeat(100)}`;
    const index = text.indexOf("false positive");
    const around = excerptAround(text, index, 200);
    expect(around.length).toBeLessThanOrEqual(200);
    expect(around.startsWith("…")).toBe(true);
    expect(around).toContain("false positive rate");
    expect(excerptAround("early hit here", 0, 200)).toBe("early hit here");
  });
});
