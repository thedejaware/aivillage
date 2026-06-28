import { describe, it, expect } from "vitest";
import { DAILY_ENERGY, type Twin } from "@aivillage/shared";
import { grantDailyEnergy, spendBeat, utcDay } from "../../src/economy/energy.js";

function makeTwin(over: Partial<Twin> = {}): Twin {
  return {
    id: "t1", ownerUserId: "u1", name: "Mehmet", traits: [], goals: [],
    avatarSpriteUrl: null, skills: { building: 0, coding: 0, art: 0, social: 0 },
    reputation: 0, locationZone: "plaza", energy: 0,
    energyUpdatedAt: "2026-06-27T10:00:00.000Z", isNpc: false, ...over
  };
}

describe("utcDay", () => {
  it("extracts the YYYY-MM-DD date", () => {
    expect(utcDay("2026-06-28T23:59:00.000Z")).toBe("2026-06-28");
  });
});

describe("grantDailyEnergy", () => {
  it("refills energy to the cap on a new UTC day", () => {
    const twin = makeTwin({ energy: 1, energyUpdatedAt: "2026-06-27T10:00:00.000Z" });
    const out = grantDailyEnergy(twin, new Date("2026-06-28T08:00:00.000Z"));
    expect(out.energy).toBe(DAILY_ENERGY);
    expect(out.energyUpdatedAt).toBe("2026-06-28T08:00:00.000Z");
  });

  it("does NOT refill twice on the same UTC day", () => {
    const twin = makeTwin({ energy: 2, energyUpdatedAt: "2026-06-28T01:00:00.000Z" });
    const out = grantDailyEnergy(twin, new Date("2026-06-28T20:00:00.000Z"));
    expect(out.energy).toBe(2);
    expect(out.energyUpdatedAt).toBe("2026-06-28T01:00:00.000Z");
  });
});

describe("spendBeat", () => {
  it("decrements energy and reports ok when energy is available", () => {
    const r = spendBeat(makeTwin({ energy: 3 }));
    expect(r.ok).toBe(true);
    expect(r.twin.energy).toBe(2);
  });

  it("refuses and leaves energy at 0 when empty", () => {
    const r = spendBeat(makeTwin({ energy: 0 }));
    expect(r.ok).toBe(false);
    expect(r.twin.energy).toBe(0);
  });
});
