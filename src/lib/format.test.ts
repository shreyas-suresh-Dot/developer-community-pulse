import { describe, expect, it } from "vitest";
import {
  anchorId,
  changeShort,
  changeText,
  durationBetween,
  engagementText,
  formatCount,
  formatDuration,
  formatIstDate,
  formatIstDateTime,
  isWeekEnd,
  recentWeekEnds,
  safeHref,
  shortId,
  signed,
  sourceName,
  waitText,
  weekLabel,
} from "./format";
import { SOURCE_NAMES, SOURCE_SLUGS } from "./contracts";
import { change } from "./pipeline/trend";

describe("IST dates", () => {
  it("formats the cron instant as Friday 07:00 IST", () => {
    expect(formatIstDateTime("2026-10-09T01:30:00Z")).toBe("Fri 9 Oct, 07:00 IST");
    expect(formatIstDate("2026-10-08T18:30:00Z")).toBe("Fri 9 Oct 2026");
  });

  it("accepts Postgres timestamptz strings with microseconds", () => {
    expect(formatIstDateTime("2026-10-12T06:08:12.237366+00:00")).toBe("Mon 12 Oct, 11:38 IST");
  });

  it("returns unparseable input unchanged instead of 'Invalid Date'", () => {
    expect(formatIstDateTime("not a date")).toBe("not a date");
  });
});

describe("week labels", () => {
  it("labels a brief by its inclusive dates and year", () => {
    expect(weekLabel("2026-10-09")).toBe("2 – 8 Oct 2026");
    expect(weekLabel("2026-10-02")).toBe("25 Sep – 1 Oct 2026");
  });

  it("validates brief ids: real dates that are Fridays", () => {
    expect(isWeekEnd("2026-10-09")).toBe(true);
    expect(isWeekEnd("2026-10-10")).toBe(false);
    expect(isWeekEnd("2026-02-30")).toBe(false);
    expect(isWeekEnd("latest")).toBe(false);
  });
});

describe("numbers", () => {
  it("groups and compacts counts", () => {
    expect(formatCount(1284)).toBe("1,284");
    expect(formatCount(12_940)).toBe("12.9K");
    expect(formatCount(40_000)).toBe("40K");
  });

  it("uses a true minus sign for negative changes", () => {
    expect(signed(5)).toBe("+5");
    expect(signed(-3)).toBe("−3");
    expect(signed(0)).toBe("0");
  });

  it("describes week-over-week change without an infinite percentage", () => {
    expect(changeText(change(7, 3))).toBe("+4 vs last week (+133%)");
    expect(changeText(change(5, 0))).toBe("+5 (none last week)");
    expect(changeText(change(4, 4))).toBe("same as last week");
    expect(changeText(change(0, 0))).toBe("none either week");
  });

  it("formats durations at the right precision", () => {
    expect(formatDuration(412)).toBe("412 ms");
    expect(formatDuration(6_210)).toBe("6.2 s");
    expect(formatDuration(148_320)).toBe("2 min 28 s");
    expect(durationBetween("2026-10-09T01:30:09Z", "2026-10-09T01:32:40Z")).toBe(151_000);
    expect(durationBetween("2026-10-09T01:30:09Z", null)).toBeNull();
  });
});

describe("community data", () => {
  it("summarises engagement per community", () => {
    expect(engagementText({ points: 212, comments: 148 })).toBe("212 points · 148 comments");
    expect(engagementText({ answers: 0, views: 1290, isAnswered: false })).toBe("0 answers · 1,290 views");
  });

  it("only links http(s) URLs", () => {
    expect(safeHref("https://news.ycombinator.com/item?id=1")).toBe("https://news.ycombinator.com/item?id=1");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });

  it("builds attribute-safe anchors from AI-written ids", () => {
    expect(anchorId("pp", "AI reviewer noise / false positives!")).toBe("pp-ai-reviewer-noise-false-positives");
    expect(anchorId("pp", "???")).toBe("pp-item");
  });
});

describe("UI helpers", () => {
  it("writes compact table changes without an infinite percentage", () => {
    expect(changeShort(change(13, 9))).toBe("+4 (+44%)");
    expect(changeShort(change(4, 0))).toBe("+4 (none before)");
    expect(changeShort(change(6, 9))).toBe("−3 (−33%)");
    expect(changeShort(change(5, 5))).toBe("no change");
  });

  it("lists the latest Friday and the ones before it", () => {
    expect(recentWeekEnds("2026-10-09", 3)).toEqual(["2026-10-09", "2026-10-02", "2026-09-25"]);
    expect(recentWeekEnds("2026-10-09", 0)).toEqual([]);
  });

  it("keeps source names in sync with the contracts", () => {
    for (const slug of SOURCE_SLUGS) expect(sourceName(slug)).toBe(SOURCE_NAMES[slug]);
  });

  it("formats waits and ids", () => {
    expect(waitText(45)).toBe("45 s");
    expect(waitText(61)).toBe("2 min");
    expect(waitText(0)).toBe("a moment");
    expect(shortId("5f0c2a7e-8a41-4c1b-9d3e-2b7f6c1a9e04")).toBe("5f0c2a7e");
  });
});
