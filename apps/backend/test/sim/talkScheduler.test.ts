import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TalkScheduler } from "../../src/sim/orderedTalk.js";

describe("TalkScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts the talk as soon as the twin reports arrival", () => {
    const run = vi.fn();
    const s = new TalkScheduler(run, 20_000);
    s.schedule("me", "ravi");
    expect(s.arrived("me")).toBe(true);
    expect(run).toHaveBeenCalledWith("me", "ravi");
    vi.advanceTimersByTime(30_000);
    expect(run).toHaveBeenCalledTimes(1); // the fallback never double-fires
  });

  it("falls back to a timer when nobody reports arrival", () => {
    const run = vi.fn();
    const s = new TalkScheduler(run, 20_000);
    s.schedule("me", "ravi");
    vi.advanceTimersByTime(19_999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledWith("me", "ravi");
  });

  it("a new order replaces the pending talk", () => {
    const run = vi.fn();
    const s = new TalkScheduler(run, 20_000);
    s.schedule("me", "ravi");
    s.schedule("me", "aiko");
    vi.advanceTimersByTime(20_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("me", "aiko");
  });

  it("cancel drops the pending talk; arrival without one does nothing", () => {
    const run = vi.fn();
    const s = new TalkScheduler(run, 20_000);
    s.schedule("me", "ravi");
    s.cancel("me");
    expect(s.arrived("me")).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(run).not.toHaveBeenCalled();
  });
});
