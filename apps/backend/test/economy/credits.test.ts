import { describe, it, expect } from "vitest";
import type { Wallet } from "@aivillage/shared";
import { canAfford, charge, refund } from "../../src/economy/credits.js";

const wallet = (credits: number): Wallet => ({ userId: "u1", credits });

describe("canAfford", () => {
  it("is true when credits >= amount", () => {
    expect(canAfford(wallet(20), 20)).toBe(true);
    expect(canAfford(wallet(21), 20)).toBe(true);
  });
  it("is false when credits < amount", () => {
    expect(canAfford(wallet(19), 20)).toBe(false);
  });
});

describe("charge", () => {
  it("deducts and reports ok when affordable", () => {
    const r = charge(wallet(50), 20);
    expect(r.ok).toBe(true);
    expect(r.wallet.credits).toBe(30);
  });
  it("refuses and leaves the wallet untouched when too poor", () => {
    const r = charge(wallet(10), 20);
    expect(r.ok).toBe(false);
    expect(r.wallet.credits).toBe(10);
  });
  it("throws on a negative amount", () => {
    expect(() => charge(wallet(10), -1)).toThrow();
  });
});

describe("refund", () => {
  it("adds credits back", () => {
    expect(refund(wallet(10), 5).credits).toBe(15);
  });
  it("throws on a negative amount", () => {
    expect(() => refund(wallet(10), -1)).toThrow();
  });
});
