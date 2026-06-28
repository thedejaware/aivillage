import { describe, it, expect } from "vitest";
import { estimateUsd, USD_PER_1K_TOKENS } from "../../src/economy/cost.js";

describe("estimateUsd", () => {
  it("uses the default rate", () => {
    expect(estimateUsd(1000)).toBeCloseTo(USD_PER_1K_TOKENS, 8);
  });
  it("scales linearly with tokens", () => {
    expect(estimateUsd(2500, 0.01)).toBeCloseTo(0.025, 8);
  });
  it("returns 0 for 0 tokens", () => {
    expect(estimateUsd(0)).toBe(0);
  });
  it("throws on negative tokens", () => {
    expect(() => estimateUsd(-1)).toThrow();
  });
});
