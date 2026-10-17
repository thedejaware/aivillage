import { describe, it, expect } from "vitest";
import { targetFps, IDLE_FPS, ACTIVE_FPS, ACTIVE_WINDOW_MS } from "../../lib/village/frameBudget";

describe("targetFps", () => {
  it("draws nothing while the tab is hidden", () => {
    expect(targetFps({ hidden: true, now: 10_000, lastInteraction: 9_999 })).toBe(0);
  });
  it("runs smooth while the user moves the camera", () => {
    expect(targetFps({ hidden: false, now: 10_000, lastInteraction: 9_500 })).toBe(ACTIVE_FPS);
  });
  it("drops to the idle rate a moment after the user stops", () => {
    expect(targetFps({ hidden: false, now: 10_000, lastInteraction: 10_000 - ACTIVE_WINDOW_MS - 1 })).toBe(IDLE_FPS);
    expect(targetFps({ hidden: false, now: 10_000, lastInteraction: 0 })).toBe(IDLE_FPS);
  });
  it("idles well below a display's refresh rate", () => {
    expect(IDLE_FPS).toBeLessThanOrEqual(30);
    expect(ACTIVE_FPS).toBe(60);
  });
});
