import { describe, expect, it } from "vitest";
import { fourWeeks, isFriday, istMidnight, latestWeekEnd, weekIndexOf } from "./weeks";

describe("latestWeekEnd", () => {
  it("returns the same Friday once 00:00 IST has passed", () => {
    // Fri 9 Oct 2026, 07:00 IST = 01:30 UTC (the cron time)
    expect(latestWeekEnd(new Date("2026-10-09T01:30:00Z"))).toBe("2026-10-09");
  });

  it("returns the previous Friday just before Friday 00:00 IST", () => {
    // Thu 8 Oct 2026 23:59 IST = 18:29 UTC
    expect(latestWeekEnd(new Date("2026-10-08T18:29:00Z"))).toBe("2026-10-02");
  });

  it("returns last Friday on a Monday", () => {
    expect(latestWeekEnd(new Date("2026-10-12T06:00:00Z"))).toBe("2026-10-09");
  });
});

describe("fourWeeks", () => {
  const weeks = fourWeeks("2026-10-09");

  it("returns 4 contiguous Friday-to-Friday IST windows, oldest first", () => {
    expect(weeks.map((w) => w.weekEnd)).toEqual(["2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09"]);
    expect(weeks[3].start).toBe("2026-10-01T18:30:00.000Z"); // Fri 2 Oct 00:00 IST
    expect(weeks[3].end).toBe("2026-10-08T18:30:00.000Z"); // Fri 9 Oct 00:00 IST
    for (let i = 1; i < 4; i++) expect(weeks[i].start).toBe(weeks[i - 1].end);
  });

  it("labels weeks by their inclusive dates, across month boundaries", () => {
    expect(weeks[3].label).toBe("2 – 8 Oct");
    expect(weeks[2].label).toBe("25 Sep – 1 Oct");
  });

  it("rejects a week end that is not a Friday", () => {
    expect(() => fourWeeks("2026-10-08")).toThrow(/not a Friday/);
  });

  it("places instants in the right week and excludes the window edges correctly", () => {
    expect(weekIndexOf(weeks, new Date("2026-10-08T18:29:59Z"))).toBe(3);
    expect(weekIndexOf(weeks, new Date("2026-10-08T18:30:00Z"))).toBe(-1); // end is exclusive
    expect(weekIndexOf(weeks, new Date(weeks[0].start))).toBe(0); // start is inclusive
  });
});

describe("date helpers", () => {
  it("rejects impossible dates", () => {
    expect(() => istMidnight("2026-02-30")).toThrow();
    expect(() => istMidnight("9 Oct")).toThrow();
  });

  it("knows Fridays", () => {
    expect(isFriday("2026-10-09")).toBe(true);
    expect(isFriday("2026-10-10")).toBe(false);
  });
});
