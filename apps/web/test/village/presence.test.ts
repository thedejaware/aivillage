import { describe, it, expect } from "vitest";
import { shouldPause, HIDDEN_PAUSE_MS, IDLE_PAUSE_MS } from "../../lib/village/presence";

const base = { hidden: false, hiddenSince: null as number | null, lastInputAt: 0, now: 1_000 };

describe("shouldPause (auto-pause a forgotten tab)", () => {
  it("keeps running while the owner is around", () => {
    expect(shouldPause(base)).toBe(false);
  });

  it("pauses once the tab has been hidden for 60 s", () => {
    expect(HIDDEN_PAUSE_MS).toBe(60_000);
    expect(shouldPause({ ...base, hidden: true, hiddenSince: 0, now: 59_999, lastInputAt: 59_000 })).toBe(false);
    expect(shouldPause({ ...base, hidden: true, hiddenSince: 0, now: 60_000, lastInputAt: 59_000 })).toBe(true);
  });

  it("a visible tab is never paused for being hidden earlier", () => {
    expect(shouldPause({ ...base, hidden: false, hiddenSince: 0, now: 120_000, lastInputAt: 119_000 })).toBe(false);
  });

  it("pauses after 10 minutes without any input, even when visible", () => {
    expect(IDLE_PAUSE_MS).toBe(10 * 60_000);
    expect(shouldPause({ ...base, lastInputAt: 0, now: IDLE_PAUSE_MS - 1 })).toBe(false);
    expect(shouldPause({ ...base, lastInputAt: 0, now: IDLE_PAUSE_MS })).toBe(true);
  });

  it("hidden without a start time counts from now (not paused yet)", () => {
    expect(shouldPause({ ...base, hidden: true, hiddenSince: null, now: 5_000, lastInputAt: 4_000 })).toBe(false);
  });
});
