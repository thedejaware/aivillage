import { describe, it, expect } from "vitest";
import { CHATTINESS_PACE, NEXT_STEP_CAP, PLAN_STEPS, callsPerHour, hourlyCost, formatHourlyCost } from "../src/index.js";

describe("CHATTINESS_PACE", () => {
  it("busier means more often", () => {
    expect(CHATTINESS_PACE.busy.tickMs).toBeLessThan(CHATTINESS_PACE.normal.tickMs);
    expect(CHATTINESS_PACE.normal.tickMs).toBeLessThan(CHATTINESS_PACE.calm.tickMs);
    expect(CHATTINESS_PACE.normal).toEqual({ tickMs: 60_000, actors: 2 });
  });
});

describe("PLAN_STEPS", () => {
  it("one planning call writes a to-do list of 3 activities", () => {
    expect(PLAN_STEPS).toBe(3);
  });
});

describe("NEXT_STEP_CAP", () => {
  it("limits next-step AI turns per minute", () => {
    expect(NEXT_STEP_CAP).toEqual({ calm: 3, normal: 6, busy: 10 });
  });
});

describe("callsPerHour", () => {
  it("grows with chattiness", () => {
    expect(callsPerHour("calm")).toBeLessThan(callsPerHour("normal"));
    expect(callsPerHour("normal")).toBeLessThan(callsPerHour("busy"));
    // clock: 60 ticks × 2 twins × 1.5 calls = 180; to-do lists: 10 twins × 24 activities / 3 per list = 80
    expect(callsPerHour("calm")).toBe(125);
    expect(callsPerHour("normal")).toBe(260);
    expect(callsPerHour("busy")).toBe(440);
    expect(callsPerHour("normal", 2)).toBe(180 + 16);
  });
});

describe("hourlyCost", () => {
  const haiku = { input: 0.1, output: 0.5 }; // $ per million tokens

  it("estimates dollars per hour from the model's price", () => {
    // 260 calls × (2000 in × $0.10 + 200 out × $0.50) / 1M = $0.078
    expect(hourlyCost("normal", haiku)).toBeCloseTo(0.078, 3);
    expect(hourlyCost("busy", haiku)).toBeGreaterThan(hourlyCost("normal", haiku));
  });

  it("formats small amounts readably", () => {
    expect(formatHourlyCost(0.054)).toBe("≈ $0.05 / hour");
    expect(formatHourlyCost(0.004)).toBe("< $0.01 / hour");
    expect(formatHourlyCost(1.8)).toBe("≈ $1.80 / hour");
  });
});
