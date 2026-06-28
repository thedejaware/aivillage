import { describe, it, expect } from "vitest";
import type { Wallet, Twin } from "@aivillage/shared";
import { projectCost, canStartProject } from "../../src/economy/projectCost.js";

const wallet = (credits: number): Wallet => ({ userId: "u1", credits });
const twin = (energy: number): Twin => ({
  id: "t1", ownerUserId: "u1", name: "Mehmet", traits: [], goals: [],
  avatarSpriteUrl: null, skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0, locationZone: "plaza", energy,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: false
});

describe("projectCost", () => {
  it("returns cost for a known cheap project", () => {
    expect(projectCost("mural")).toEqual({ energyCost: 2, creditCost: 0 });
  });
  it("charges credits for a big/joint project", () => {
    expect(projectCost("observatory")).toEqual({ energyCost: 6, creditCost: 20 });
  });
  it("throws on an unknown type", () => {
    // @ts-expect-error invalid type on purpose
    expect(() => projectCost("castle")).toThrow();
  });
});

describe("canStartProject", () => {
  it("true when energy and credits both suffice", () => {
    expect(canStartProject("observatory", twin(6), wallet(20)).ok).toBe(true);
  });
  it("false (reason energy) when energy too low", () => {
    const r = canStartProject("observatory", twin(5), wallet(20));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("energy");
  });
  it("false (reason credits) when credits too low", () => {
    const r = canStartProject("observatory", twin(6), wallet(19));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("credits");
  });
});
