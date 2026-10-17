import { describe, it, expect } from "vitest";
import { CHATTINESS_PACE, callsPerHour, hourlyCost, formatHourlyCost } from "../src/index.js";

describe("CHATTINESS_PACE", () => {
  it("busier means more often", () => {
    expect(CHATTINESS_PACE.busy.tickMs).toBeLessThan(CHATTINESS_PACE.normal.tickMs);
    expect(CHATTINESS_PACE.normal.tickMs).toBeLessThan(CHATTINESS_PACE.calm.tickMs);
    expect(CHATTINESS_PACE.normal).toEqual({ tickMs: 60_000, actors: 2 });
  });
});

describe("callsPerHour", () => {
  it("grows with chattiness", () => {
    expect(callsPerHour("calm")).toBeLessThan(callsPerHour("normal"));
    expect(callsPerHour("normal")).toBeLessThan(callsPerHour("busy"));
    expect(callsPerHour("normal")).toBe(180); // 60 ticks × 2 twins × 1.5 calls
  });
});

describe("hourlyCost", () => {
  const haiku = { input: 0.1, output: 0.5 }; // $ per million tokens

  it("estimates dollars per hour from the model's price", () => {
    // 180 calls × (2000 in × $0.10 + 200 out × $0.50) / 1M = $0.054
    expect(hourlyCost("normal", haiku)).toBeCloseTo(0.054, 3);
    expect(hourlyCost("busy", haiku)).toBeGreaterThan(hourlyCost("normal", haiku));
  });

  it("formats small amounts readably", () => {
    expect(formatHourlyCost(0.054)).toBe("≈ $0.05 / hour");
    expect(formatHourlyCost(0.004)).toBe("< $0.01 / hour");
    expect(formatHourlyCost(1.8)).toBe("≈ $1.80 / hour");
  });
});
