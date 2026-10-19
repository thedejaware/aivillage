import { describe, it, expect } from "vitest";
import { energyNow, friendsText, friendsTip, popularityText, popularityTip } from "../../lib/hud/stats";

describe("popularity", () => {
  it("shows only the rank", () => {
    expect(popularityText(5, 10)).toBe("#5 of 10");
    expect(popularityText(1, 1)).toBe("#1 of 1");
  });

  it("shows a dash before the rank is known", () => {
    expect(popularityText(0, 10)).toBe("—");
    expect(popularityText(3, 0)).toBe("—");
  });

  it("the tip says what it means and how to climb, with the twin's name", () => {
    const tip = popularityTip("Mehmet");
    expect(tip).toContain("Mehmet");
    expect(tip).toMatch(/#1/);
    expect(tip).toMatch(/chat/i);
  });
});

describe("friends", () => {
  it("counts liked twins and rivals", () => {
    expect(friendsText(5, 1)).toBe("5 liked · 1 rival");
    expect(friendsText(0, 2)).toBe("0 liked · 2 rivals");
    expect(friendsText(3, 0)).toBe("3 liked · 0 rivals");
  });

  it("the tip explains both words, with the twin's name", () => {
    const tip = friendsTip("Mehmet");
    expect(tip).toMatch(/Liked: .*Mehmet likes/);
    expect(tip).toMatch(/Rivals: .*Mehmet dislikes/);
  });
});

describe("energyNow (the inspector's live energy bar)", () => {
  const T0 = Date.parse("2026-10-19T12:00:00Z");
  const iso = (ms: number) => new Date(T0 + ms).toISOString();
  const plan = { base: 25, issuedAt: iso(0), holdUntil: iso(600_000), energyTo: 100, arrivedAt: iso(10_000), zone: "home" };

  it("without a plan it shows the server's value", () => {
    expect(energyNow({ stamina: 64, energyPlan: null }, T0)).toEqual({ value: 64, charging: false });
  });

  it("with a plan it climbs on its own between server updates, one point every 4 s asleep", () => {
    expect(energyNow({ stamina: 25, energyPlan: plan }, T0 + 50_000)).toEqual({ value: 35, charging: true });
  });

  it("stays put while the twin is still walking", () => {
    expect(energyNow({ stamina: 25, energyPlan: { ...plan, arrivedAt: null } }, T0 + 50_000)).toEqual({ value: 25, charging: false });
  });

  it("stops charging when full", () => {
    expect(energyNow({ stamina: 25, energyPlan: plan }, T0 + 500_000)).toEqual({ value: 100, charging: false });
  });
});
