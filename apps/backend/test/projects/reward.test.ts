import { describe, it, expect } from "vitest";
import type { Twin } from "@aivillage/shared";
import { rewardFor, applyReward } from "../../src/projects/reward.js";

const twin = (): Twin => ({
  id: "t1", ownerUserId: "u1", name: "Mehmet", traits: [], goals: [],
  avatarSpriteUrl: null, skills: { building: 1, coding: 0, art: 0, social: 0 },
  reputation: 2, locationZone: "plaza", energy: 5,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: false
});

describe("rewardFor", () => {
  it("maps a build-type project to the building skill", () => {
    expect(rewardFor("fountain")).toMatchObject({ skill: "building" });
  });
  it("maps an arcade_game to coding", () => {
    expect(rewardFor("arcade_game").skill).toBe("coding");
  });
});

describe("applyReward", () => {
  it("adds xp to the right skill and bumps reputation", () => {
    const out = applyReward(twin(), { skill: "building", xp: 10, reputation: 2 });
    expect(out.skills.building).toBe(11);
    expect(out.reputation).toBe(4);
  });
});
