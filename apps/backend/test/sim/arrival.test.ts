import { describe, it, expect } from "vitest";
import { ENERGY_GAIN_MS, ENERGY_REST_MS, kitchenEnergyPhases, liveStamina, type OwnerOrder, type Twin } from "@aivillage/shared";
import { arrive } from "../../src/sim/arrival.js";

const T0 = new Date("2026-10-19T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function twin(stamina: number, order: Partial<OwnerOrder>): Twin {
  return {
    id: "t1", ownerUserId: null, name: "Mehmet", persona: "", traits: [], goals: [], skills: { building: 0, coding: 0, art: 0, social: 0 },
    reputation: 0, locationZone: "home", energy: 5, stamina,
    order: { kind: "act", zone: "home", targetName: null, label: "sleep", issuedAt: T0.toISOString(), holdUntil: at(190_000).toISOString(), ...order } as OwnerOrder
  } as unknown as Twin;
}

describe("arrive", () => {
  it("records when the twin got there; energy starts moving from then", () => {
    const t = arrive(twin(60, { zone: "maker_space", energyTo: 75 }), T0.toISOString(), at(20_000))!;
    expect(t.order!.arrivedAt).toBe(at(20_000).toISOString());
    expect(liveStamina(t.stamina!, t.order, at(20_000 + 10 * ENERGY_REST_MS))).toBe(70); // café: +1 per 15 s
  });

  it("a twin sent home sleeps until its energy is full", () => {
    const t = arrive(twin(25, { energyTo: 100 }), T0.toISOString(), at(30_000))!;
    expect(Date.parse(t.order!.holdUntil)).toBe(at(30_000).getTime() + 75 * ENERGY_GAIN_MS);
  });

  it("other activities keep their own length", () => {
    const t = arrive(twin(60, { zone: "maker_space", energyTo: 75 }), T0.toISOString(), at(20_000))!;
    expect(t.order!.holdUntil).toBe(at(190_000).toISOString());
  });

  it("a meal always finishes: a late arrival at the kitchen stretches the hold to the end of the meal", () => {
    const phases = kitchenEnergyPhases("pasta");
    const total = phases.reduce((n, p) => n + p.ms, 0);
    const t = arrive(twin(50, { zone: "kitchen", energyTo: null, energyPhases: phases, holdUntil: at(165_000).toISOString() }), T0.toISOString(), at(60_000))!;
    expect(Date.parse(t.order!.holdUntil)).toBe(at(60_000).getTime() + total);
    // an early arrival keeps the hold it had
    const early = arrive(twin(50, { zone: "kitchen", energyTo: null, energyPhases: phases, holdUntil: at(165_000).toISOString() }), T0.toISOString(), at(20_000))!;
    expect(early.order!.holdUntil).toBe(at(165_000).toISOString());
  });

  it("ignores a late report for an older order, a second report, or an ended order", () => {
    const tw = twin(25, { energyTo: 100 });
    expect(arrive(tw, at(-5_000).toISOString(), at(30_000))).toBeNull();
    expect(arrive(twin(25, { energyTo: 100, arrivedAt: at(10_000).toISOString() }), T0.toISOString(), at(30_000))).toBeNull();
    expect(arrive(tw, T0.toISOString(), at(200_000))).toBeNull();
    expect(arrive({ ...tw, order: null }, T0.toISOString(), at(30_000))).toBeNull();
  });
});
