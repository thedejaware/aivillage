import { describe, it, expect } from "vitest";
import { labelFor } from "../src/social.js";

describe("labelFor", () => {
  it("returns 'nemesis' at exactly -60", () => {
    expect(labelFor(-60)).toBe("nemesis");
  });

  it("returns 'rival' at -59.9 (just above nemesis boundary)", () => {
    expect(labelFor(-59.9)).toBe("rival");
  });

  it("returns 'rival' at exactly -25", () => {
    expect(labelFor(-25)).toBe("rival");
  });

  it("returns 'acquaintance' at -24 (just above rival boundary)", () => {
    expect(labelFor(-24)).toBe("acquaintance");
  });

  it("returns 'acquaintance' at 0", () => {
    expect(labelFor(0)).toBe("acquaintance");
  });

  it("returns 'acquaintance' at 24 (just below friend boundary)", () => {
    expect(labelFor(24)).toBe("acquaintance");
  });

  it("returns 'friend' at exactly 25", () => {
    expect(labelFor(25)).toBe("friend");
  });

  it("returns 'friend' at 59 (just below close friend boundary)", () => {
    expect(labelFor(59)).toBe("friend");
  });

  it("returns 'close friend' at exactly 60", () => {
    expect(labelFor(60)).toBe("close friend");
  });

  it("returns 'close friend' at 100", () => {
    expect(labelFor(100)).toBe("close friend");
  });

  it("returns 'nemesis' at -100 (extreme low)", () => {
    expect(labelFor(-100)).toBe("nemesis");
  });
});
