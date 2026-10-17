import { describe, it, expect } from "vitest";
import type { Twin } from "../src/index.js";
import { toWorldState, DEFAULT_ZONES, DEFAULT_APPEARANCE, HAIRSTYLES } from "../src/index.js";

const base: Twin = {
  id: "t1", ownerUserId: "u1", name: "Memo Akin", traits: [], goals: [], avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 }, reputation: 0, locationZone: "plaza",
  energy: 5, energyUpdatedAt: "2026-10-17T00:00:00Z", isNpc: false
};

describe("twin view: looks, role and saved pose", () => {
  it("carries the twin's appearance (defaults when missing)", () => {
    const look = { ...DEFAULT_APPEARANCE, hair: HAIRSTYLES[5].id };
    const [withLook, without] = toWorldState({
      zones: DEFAULT_ZONES, structures: [], twins: [{ ...base, appearance: look }, { ...base, id: "t2" }]
    }).twins;
    expect(withLook.appearance).toEqual(look);
    expect(without.appearance).toEqual(DEFAULT_APPEARANCE);
  });
  it("marks the main twin", () => {
    const [main, villager] = toWorldState({
      zones: DEFAULT_ZONES, structures: [], twins: [{ ...base, role: "main" }, { ...base, id: "t2", role: "villager" }]
    }).twins;
    expect(main.isMain).toBe(true);
    expect(villager.isMain).toBe(false);
  });
  it("passes the saved pose so the village resumes where it was left", () => {
    const pose = { x: 1.25, z: -2.5, yaw: 0.7, zone: "maker_space" };
    const [t] = toWorldState({ zones: DEFAULT_ZONES, structures: [], twins: [{ ...base, pose }] }).twins;
    expect(t.pose).toEqual(pose);
  });
  it("leaves deactivated twins out of the village", () => {
    const ws = toWorldState({ zones: DEFAULT_ZONES, structures: [], twins: [base, { ...base, id: "gone", active: false }] });
    expect(ws.twins.map((t) => t.id)).toEqual(["t1"]);
  });
});
