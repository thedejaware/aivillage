import { describe, it, expect } from "vitest";
import type { Twin, Project, BeatResult } from "@aivillage/shared";
import { applyBeat, type BeatApplyDeps } from "../../src/sim/applyBeat.js";

const twin = (over: Partial<Twin> = {}): Twin => ({
  id: "t1", ownerUserId: null, name: "Mehmet", traits: [], goals: [],
  avatarSpriteUrl: null, skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0, locationZone: "plaza", energy: 5,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: true, ...over
});

const deps: BeatApplyDeps = {
  newProjectId: () => "p1",
  newStructureId: () => "s1",
  newMemoryId: () => "m1",
  now: () => "2026-06-28T00:00:00.000Z",
  chooseProjectType: () => "fountain"
};

const beat = (over: Partial<BeatResult> = {}): BeatResult => ({ verb: "work", target: null, narrative: "n", ...over });

describe("applyBeat", () => {
  it("move changes the twin's zone", () => {
    const out = applyBeat(twin(), null, beat({ verb: "move", target: "maker_space" }), deps);
    expect(out.twin.locationZone).toBe("maker_space");
    expect(out.project).toBeNull();
  });

  it("work starts a project when none is active and advances it one step", () => {
    const out = applyBeat(twin(), null, beat({ verb: "work" }), deps);
    expect(out.project).not.toBeNull();
    expect(out.project!.stepsDone).toBe(1);
    expect(out.project!.type).toBe("fountain");
    expect(out.structure).toBeNull();
  });

  it("work completing a project places a structure, rewards the twin, clears the active project", () => {
    const almost: Project = {
      id: "p1", type: "fountain", zone: "plaza", participantTwinIds: ["t1"],
      stepsTotal: 1, stepsDone: 0, status: "active"
    };
    const out = applyBeat(twin(), almost, beat({ verb: "work" }), deps);
    expect(out.structure).toMatchObject({ id: "s1", type: "fountain", zone: "plaza" });
    expect(out.twin.skills.building).toBe(10);
    expect(out.twin.reputation).toBe(2);
    expect(out.project).toBeNull();
  });

  it("always produces a memory carrying the narrative", () => {
    const out = applyBeat(twin(), null, beat({ narrative: "hello world" }), deps);
    expect(out.memory).toMatchObject({ twinId: "t1", content: "hello world", kind: "work" });
  });
});
