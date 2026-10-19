import { describe, it, expect } from "vitest";
import {
  ENERGY_DRAIN_MS, ENERGY_GAIN_MS, ENERGY_REST_MS, ENERGY_LIBRARY_READ_MS, ENERGY_STUDY_MS, WALK_GUESS_MS, type EnergyPhase, isCharging, liveStamina, msToReach, settleEnergy, energyPlanOf, type EnergyOrder
} from "../src/energy";

const T0 = Date.parse("2026-10-19T12:00:00Z");
const at = (ms: number) => new Date(T0 + ms);
const iso = (ms: number) => at(ms).toISOString();

/** an order issued at T0, held 10 min, that moves energy toward `to` (sleeping at home unless said otherwise) */
const order = (to: number, extra: Partial<EnergyOrder> = {}): EnergyOrder => ({
  issuedAt: iso(0), holdUntil: iso(600_000), energyTo: to, zone: "home", ...extra
});

describe("energy moves slowly, at a fixed rate", () => {
  it("sleeps at +1 every 4 s, rests elsewhere at +1 every 15 s, tires at −1 every 6 s", () => {
    expect([ENERGY_GAIN_MS, ENERGY_REST_MS, ENERGY_DRAIN_MS]).toEqual([4_000, 15_000, 6_000]);
  });

  it("a coffee only helps a little: +1 every 15 s away from home", () => {
    const cafe = order(75, { zone: "maker_space", arrivedAt: iso(0) });
    expect(liveStamina(60, cafe, at(60_000))).toBe(64); // a 1-minute coffee → +4
    expect(msToReach(60, 75, "maker_space")).toBe(15 * ENERGY_REST_MS);
    expect(isCharging(60, cafe, at(30_000))).toBe(true);
  });

  it("without an order (or a target) energy stays put", () => {
    expect(liveStamina(40, null, at(60_000))).toBe(40);
    expect(liveStamina(40, { issuedAt: iso(0), holdUntil: iso(600_000) }, at(60_000))).toBe(40);
  });

  it("nothing changes while the twin is still walking there", () => {
    expect(liveStamina(25, order(100), at(40_000))).toBe(25);
  });

  it("after arrival it climbs in whole steps: +1 per 4 s", () => {
    const o = order(100, { arrivedAt: iso(20_000) });
    expect(liveStamina(25, o, at(20_000))).toBe(25);
    expect(liveStamina(25, o, at(27_000))).toBe(26); // 7 s → one whole step
    expect(liveStamina(25, o, at(60_000))).toBe(35); // 40 s → +10
  });

  it("stops at the target", () => {
    const o = order(100, { arrivedAt: iso(0) });
    expect(liveStamina(25, o, at(400_000))).toBe(100);
    expect(liveStamina(90, order(100, { arrivedAt: iso(0), holdUntil: iso(10_000_000) }), at(9_000_000))).toBe(100);
  });

  it("tiring activities drain at −1 per 6 s, down to the target", () => {
    const o = order(68, { arrivedAt: iso(0) });
    expect(liveStamina(80, o, at(60_000))).toBe(70);
    expect(liveStamina(80, o, at(300_000))).toBe(68);
  });

  it("stops when the activity ends, even if the target wasn't reached", () => {
    const o = order(100, { arrivedAt: iso(0), holdUntil: iso(80_000) });
    expect(liveStamina(25, o, at(500_000))).toBe(45); // 80 s → +20
  });

  it("an ended activity nobody saw arrive counts from a walk guess", () => {
    const o = order(100, { holdUntil: iso(WALK_GUESS_MS + 40_000) });
    expect(liveStamina(25, o, at(10_000_000))).toBe(35);
  });

  it("never leaves 0–100", () => {
    expect(liveStamina(3, order(-20, { arrivedAt: iso(0) }), at(600_000))).toBe(0);
    expect(liveStamina(99, order(140, { arrivedAt: iso(0) }), at(600_000))).toBe(100);
  });
});

describe("msToReach", () => {
  it("is the whole time the change takes", () => {
    expect(msToReach(25, 100, "home")).toBe(75 * ENERGY_GAIN_MS); // 5 minutes asleep
    expect(msToReach(80, 68)).toBe(12 * ENERGY_DRAIN_MS);
    expect(msToReach(50, 50)).toBe(0);
  });
});

describe("isCharging", () => {
  it("is true only while energy is still climbing after arrival", () => {
    const o = order(100, { arrivedAt: iso(0) });
    expect(isCharging(25, o, at(40_000))).toBe(true);
    expect(isCharging(25, o, at(400_000))).toBe(false); // full
    expect(isCharging(25, order(100), at(40_000))).toBe(false); // still walking
    expect(isCharging(80, order(68, { arrivedAt: iso(0) }), at(40_000))).toBe(false); // draining
  });
});

describe("settleEnergy", () => {
  it("folds the energy gained so far into the stored value", () => {
    const o = order(100, { arrivedAt: iso(0) });
    const s = settleEnergy(25, o, at(41_000));
    expect(s.stamina).toBe(35);
    expect(liveStamina(s.stamina, s.order, at(41_000))).toBe(35);
  });

  it("settling any number of times never changes later energy (no lost part-steps)", () => {
    for (const [to, zone] of [[100, "home"], [100, "maker_space"], [40, "gym"]] as const) {
      const o = order(to, { zone, arrivedAt: iso(5_000), holdUntil: iso(300_000) });
      let cur: { stamina: number; order: EnergyOrder | null } = { stamina: 70, order: o };
      for (let ms = 0; ms <= 400_000; ms += 1_300) {
        cur = settleEnergy(cur.stamina, cur.order, at(ms));
        expect(liveStamina(cur.stamina, cur.order, at(ms)), `${to}@${ms}`).toBe(liveStamina(70, o, at(ms)));
      }
    }
  });

  it("leaves a twin that is still walking alone", () => {
    const o = order(100);
    expect(settleEnergy(25, o, at(10_000))).toEqual({ stamina: 25, order: o });
    expect(settleEnergy(25, null, at(10_000))).toEqual({ stamina: 25, order: null });
  });
});

describe("the library's own rates", () => {
  it("reading +1 every 35 s, studying −1 every 60 s", () => {
    expect([ENERGY_LIBRARY_READ_MS, ENERGY_STUDY_MS]).toEqual([35_000, 60_000]);
    expect(liveStamina(50, order(60, { zone: "library", arrivedAt: iso(0) }), at(70_000))).toBe(52);
    expect(liveStamina(50, order(40, { zone: "library", arrivedAt: iso(0) }), at(130_000))).toBe(48);
  });
});

describe("energy phases (the kitchen: cook, then eat)", () => {
  const meal: EnergyPhase[] = [{ ms: 60_000, everyMs: 10_000, dir: -1 }, { ms: 5_000, everyMs: 10_000, dir: 0 }, { ms: 60_000, everyMs: 5_000, dir: 1 }];
  const cook = (extra: Partial<EnergyOrder> = {}): EnergyOrder => ({ issuedAt: iso(0), holdUntil: iso(600_000), zone: "kitchen", energyPhases: meal, arrivedAt: iso(0), ...extra });

  it("goes down while cooking, then up while eating", () => {
    expect(liveStamina(50, cook(), at(30_000))).toBe(47);
    expect(liveStamina(50, cook(), at(60_000))).toBe(44);
    expect(liveStamina(50, cook(), at(65_000))).toBe(44); // carrying the plate
    expect(liveStamina(50, cook(), at(125_000))).toBe(56); // ate for 60 s: +12
    expect(liveStamina(50, cook(), at(500_000))).toBe(56); // the meal is over
  });

  it("a nearly empty twin floors at 0 while cooking, then still eats its way up", () => {
    expect(liveStamina(3, cook(), at(60_000))).toBe(0);
    expect(liveStamina(3, cook(), at(125_000))).toBe(12);
  });

  it("nothing changes during the walk; ends at holdUntil", () => {
    expect(liveStamina(50, cook({ arrivedAt: null }), at(60_000))).toBe(50);
    expect(liveStamina(50, cook({ holdUntil: iso(90_000) }), at(500_000))).toBe(44 + 5); // 25 s of eating
  });

  it("phases win over energyTo", () => {
    expect(liveStamina(50, cook({ energyTo: 100 }), at(60_000))).toBe(44);
  });

  it("settling mid-meal any number of times never changes later energy", () => {
    const o = cook({ arrivedAt: iso(3_000) });
    let cur: { stamina: number; order: EnergyOrder | null } = { stamina: 50, order: o };
    for (let ms = 0; ms <= 200_000; ms += 1_700) {
      cur = settleEnergy(cur.stamina, cur.order, at(ms));
      expect(liveStamina(cur.stamina, cur.order, at(ms)), `@${ms}`).toBe(liveStamina(50, o, at(ms)));
    }
  });

  it("charging only while eating", () => {
    expect(isCharging(50, cook(), at(30_000))).toBe(false);
    expect(isCharging(50, cook(), at(90_000))).toBe(true);
    expect(energyPlanOf(50, cook(), at(10_000))!.energyPhases).toEqual(meal);
  });
});
