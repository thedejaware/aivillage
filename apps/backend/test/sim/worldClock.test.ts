import { describe, it, expect, vi } from "vitest";
import { pickActors, tickIntervalMs, startWorldClock } from "../../src/sim/worldClock.js";
import type { Twin } from "@aivillage/shared";

const mkTwin = (id: string, energy = 0): Twin => ({
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

const NOON = new Date("2026-10-17T12:00:00Z");

describe("pickActors (no daily cap — talk is paid by the player's own AI)", () => {
  it("picks twins even with zero energy", () => {
    const out = pickActors([mkTwin("a", 0), mkTwin("b", 0)], { maxActors: 1, now: NOON, random: () => 0 });
    expect(out.length).toBe(1);
  });

  it("never exceeds maxActors", () => {
    const twins = ["a", "b", "c", "d", "e"].map((id) => mkTwin(id));
    expect(pickActors(twins, { maxActors: 2, now: NOON, random: Math.random }).length).toBe(2);
  });

  it("picks different twins (no duplicates) and varies with chance", () => {
    const twins = ["a", "b", "c"].map((id) => mkTwin(id));
    const out = pickActors(twins, { maxActors: 3, now: NOON, random: Math.random });
    expect(new Set(out.map((t) => t.id)).size).toBe(3);
    expect(pickActors(twins, { maxActors: 1, now: NOON, random: () => 0.99 })[0].id).toBe("c");
  });

  it("never picks a twin that is following its owner's order", () => {
    const ordered: Twin = {
      ...mkTwin("ordered"),
      order: { kind: "go", zone: "maker_space", targetName: null, label: "x", issuedAt: "2026-10-17T11:59:00Z", holdUntil: "2026-10-17T12:09:00Z" }
    };
    const out = pickActors([ordered, mkTwin("free")], { maxActors: 2, now: NOON, random: () => 0 });
    expect(out.map((t) => t.id)).toEqual(["free"]);
  });

  it("skips twins busy at a busy place (pool, coaster…) but picks twins resting at calm places", () => {
    const at = (id: string, zone: string, auto = true): Twin => ({
      ...mkTwin(id),
      order: { kind: "act", auto, zone, targetName: null, label: "x", issuedAt: "2026-10-17T11:59:00Z", holdUntil: "2026-10-17T12:04:00Z" }
    });
    const twins = [at("swimmer", "pool"), at("rider", "funfair"), at("eater", "maker_space"), at("viewer", "cinema"), at("boss", "maker_space", false)];
    const out = pickActors(twins, { maxActors: 5, now: NOON, random: () => 0 });
    expect(out.map((t) => t.id).sort()).toEqual(["eater", "viewer"]);
  });

  it("picks the twin again once the order has expired", () => {
    const expired: Twin = {
      ...mkTwin("expired"),
      order: { kind: "stay", zone: "plaza", targetName: null, label: "x", issuedAt: "2026-10-17T11:00:00Z", holdUntil: "2026-10-17T11:10:00Z" }
    };
    expect(pickActors([expired], { maxActors: 2, now: NOON, random: () => 0 }).map((t) => t.id)).toEqual(["expired"]);
  });
});

describe("tickIntervalMs (chattiness)", () => {
  it("busy talks more often than normal, normal more often than calm", () => {
    expect(tickIntervalMs("busy")).toBeLessThan(tickIntervalMs("normal"));
    expect(tickIntervalMs("normal")).toBeLessThan(tickIntervalMs("calm"));
    expect(tickIntervalMs("normal")).toBe(60_000);
  });
});

describe("startWorldClock pauses when nobody is watching", () => {
  it("does nothing while no browser is open or no AI is set", async () => {
    const runTick = vi.fn(async () => []);
    const clock = startWorldClock({
      emitFrames: () => {},
      isWatched: () => false,
      getLlm: async () => ({ generate: async () => "" }),
      getChattiness: async () => "normal",
      runTick
    });
    expect(await clock.tick()).toEqual([]);
    clock.stop();

    const clock2 = startWorldClock({
      emitFrames: () => {},
      isWatched: () => true,
      getLlm: async () => null,
      getChattiness: async () => "normal",
      runTick
    });
    expect(await clock2.tick()).toEqual([]);
    clock2.stop();
    expect(runTick).not.toHaveBeenCalled();
  });

  it("runs a tick and emits its frames while watched", async () => {
    const frame = { zones: [], twins: [], structures: [] };
    const emitFrames = vi.fn();
    const clock = startWorldClock({
      emitFrames,
      isWatched: () => true,
      getLlm: async () => ({ generate: async () => "" }),
      getChattiness: async () => "busy",
      runTick: async () => [frame]
    });
    expect(await clock.tick()).toEqual([frame]);
    expect(emitFrames).toHaveBeenCalledWith([frame]);
    clock.stop();
  });
});
