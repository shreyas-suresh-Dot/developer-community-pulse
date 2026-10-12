import { describe, expect, it } from "vitest";
import { change } from "./trend";

describe("change", () => {
  it("labels tiny volumes as quiet instead of a dramatic percentage", () => {
    expect(change(2, 1)).toMatchObject({ abs: 1, pct: 100, trend: "quiet" });
    expect(change(0, 0)).toMatchObject({ abs: 0, pct: null, trend: "quiet" });
  });

  it("labels a topic with no prior mentions as new, without an infinite percentage", () => {
    expect(change(5, 0)).toMatchObject({ abs: 5, pct: null, trend: "new" });
  });

  it("needs both a 25% and a 3-mention move to call rising or falling", () => {
    expect(change(14, 4)).toMatchObject({ pct: 250, trend: "rising" });
    expect(change(4, 14)).toMatchObject({ pct: -71, trend: "falling" });
    expect(change(52, 50)).toMatchObject({ pct: 4, trend: "steady" });
    expect(change(5, 4)).toMatchObject({ pct: 25, abs: 1, trend: "steady" });
  });

  it("treats a drop to zero from a real volume as falling", () => {
    expect(change(0, 6)).toMatchObject({ abs: -6, pct: -100, trend: "falling" });
  });
});
