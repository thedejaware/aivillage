import { describe, it, expect } from "vitest";
import type { Relationship } from "@aivillage/shared";
import { popularityScores } from "../../src/sim/popularity.js";

const rel = (from: string, to: string, score: number): Relationship => ({
  fromTwinId: from,
  toTwinId: to,
  score,
  updatedAt: "2026-07-05T00:00:00.000Z"
});

describe("popularityScores", () => {
  it("returns an empty map for no relationships", () => {
    expect(popularityScores([]).size).toBe(0);
  });

  it("averages incoming scores (rounded)", () => {
    const m = popularityScores([rel("a", "c", 30), rel("b", "c", 41)]);
    expect(m.get("c")).toBe(36); // (30+41)/2 = 35.5 -> 36
  });

  it("counts only incoming, not outgoing", () => {
    const m = popularityScores([rel("a", "b", 50)]);
    expect(m.get("b")).toBe(50);
    expect(m.has("a")).toBe(false);
  });

  it("handles negative feelings", () => {
    const m = popularityScores([rel("a", "b", -40), rel("c", "b", -20)]);
    expect(m.get("b")).toBe(-30);
  });
});
