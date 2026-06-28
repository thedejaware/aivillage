import { describe, it, expect } from "vitest";
import type { Twin, Structure } from "../src/index.js";
import { toWorldState, colorForId, type WorldZone } from "../src/world.js";

const zones: WorldZone[] = [
  { name: "plaza", col: 3, row: 3 },
  { name: "maker_space", col: 0, row: 5 }
];

const twin = (id: string, zone: string): Twin => ({
  id,
  ownerUserId: null,
  name: "T-" + id,
  traits: [],
  goals: [],
  avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0,
  locationZone: zone,
  energy: 5,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z",
  isNpc: true
});

describe("colorForId", () => {
  it("is deterministic", () => {
    expect(colorForId("abc")).toBe(colorForId("abc"));
  });
});

describe("toWorldState", () => {
  it("places a twin at its zone coordinates", () => {
    const ws = toWorldState({ zones, twins: [twin("t1", "plaza")], structures: [] });
    expect(ws.twins[0]).toMatchObject({ id: "t1", col: 3, row: 3 });
  });

  it("offsets multiple twins sharing a zone so they don't overlap", () => {
    const ws = toWorldState({ zones, twins: [twin("a", "plaza"), twin("b", "plaza")], structures: [] });
    const [a, b] = ws.twins;
    expect(`${a.col},${a.row}`).not.toBe(`${b.col},${b.row}`);
  });

  it("maps a structure to its zone and attaches a say when provided", () => {
    const s: Structure = { id: "s1", projectId: "p1", type: "fountain", zone: "maker_space" };
    const ws = toWorldState({
      zones,
      twins: [twin("t1", "plaza")],
      structures: [s],
      saysByTwinId: { t1: "hi" }
    });
    expect(ws.structures[0]).toMatchObject({ id: "s1", type: "fountain", col: 0, row: 5 });
    expect(ws.twins[0].say).toBe("hi");
  });

  it("falls back to the first zone for an unknown zone name", () => {
    const ws = toWorldState({ zones, twins: [twin("t1", "nowhere")], structures: [] });
    expect(ws.twins[0]).toMatchObject({ col: 3, row: 3 });
  });
});
