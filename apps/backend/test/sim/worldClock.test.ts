import { describe, it, expect } from "vitest";
import { pickActors } from "../../src/sim/worldClock.js";
import type { Twin } from "@aivillage/shared";

const mkTwin = (id: string, energy: number): Twin => ({
  id,
  ownerUserId: null,
  name: id,
  traits: [],
  goals: [],
  avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0,
  locationZone: "plaza",
  energy,
  energyUpdatedAt: new Date().toISOString(),
  isNpc: true
});

const NOON_UTC = new Date("2026-07-10T12:00:00Z"); // 12h left in the UTC day

describe("pickActors", () => {
  it("never picks a twin that is following its owner's order", () => {
    const ordered: Twin = {
      ...mkTwin("ordered", 5),
      order: { kind: "go", zone: "maker_space", targetName: null, label: "x", issuedAt: "2026-07-10T11:59:00Z", holdUntil: "2026-07-10T12:09:00Z" }
    };
    const out = pickActors([ordered, mkTwin("free", 5)], {
      maxActors: 2, intervalMs: 120_000, now: NOON_UTC, random: () => 0
    });
    expect(out.map((t) => t.id)).toEqual(["free"]);
  });

  it("picks the twin again once the order has expired", () => {
    const expired: Twin = {
      ...mkTwin("expired", 5),
      order: { kind: "stay", zone: "plaza", targetName: null, label: "x", issuedAt: "2026-07-10T11:00:00Z", holdUntil: "2026-07-10T11:10:00Z" }
    };
    const out = pickActors([expired], { maxActors: 2, intervalMs: 120_000, now: NOON_UTC, random: () => 0 });
    expect(out.map((t) => t.id)).toEqual(["expired"]);
  });

  it("returns nobody when no twin has energy", () => {
    const out = pickActors([mkTwin("a", 0), mkTwin("b", 0)], {
      maxActors: 2, intervalMs: 120_000, now: NOON_UTC, random: () => 0
    });
    expect(out).toEqual([]);
  });

  it("never exceeds maxActors even when everyone wants to act", () => {
    const twins = ["a", "b", "c", "d", "e"].map((id) => mkTwin(id, 5));
    const out = pickActors(twins, {
      maxActors: 2, intervalMs: 120_000, now: NOON_UTC, random: () => 0 // random() < p always
    });
    expect(out.length).toBe(2);
  });

  it("acts near-certainly when remaining energy ≥ remaining ticks (end of day catch-up)", () => {
    const nearMidnight = new Date("2026-07-10T23:58:00Z"); // 1 tick left
    const out = pickActors([mkTwin("a", 3)], {
      maxActors: 2, intervalMs: 120_000, now: nearMidnight, random: () => 0.99
    });
    expect(out.length).toBe(1); // p is capped at 1 → even random()=0.99 acts
  });

  it("spreads beats: with a long day ahead, low random draws act and high draws wait", () => {
    // 12h left / 2min ticks = 360 ticks; energy 5 → p ≈ max(0.05, 5/360) ≈ 0.05
    const eager = pickActors([mkTwin("a", 5)], {
      maxActors: 2, intervalMs: 120_000, now: NOON_UTC, random: () => 0.01
    });
    expect(eager.length).toBe(1);

    let calls = 0;
    const lazy = pickActors([mkTwin("a", 5)], {
      maxActors: 2, intervalMs: 120_000, now: NOON_UTC,
      random: () => { calls += 1; return 0.9; } // skip both the pick and the liveliness fallback
    });
    expect(lazy).toEqual([]);
    expect(calls).toBeGreaterThan(0);
  });
});
