import { describe, it, expect } from "vitest";
import type { Twin } from "@aivillage/shared";
import { runTwinBeats, type RunDeps } from "../../src/sim/runTwinBeats.js";
import { CannedLlmClient } from "../../src/sim/cannedLlm.js";

const twin = (energy: number): Twin => ({
  id: "t1", ownerUserId: null, name: "Mehmet", traits: [], goals: [],
  avatarSpriteUrl: null, skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0, locationZone: "plaza", energy,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: true
});

let n = 0;
const deps: RunDeps = {
  newProjectId: () => `p${++n}`,
  newStructureId: () => `s${++n}`,
  newMemoryId: () => `m${++n}`,
  now: () => "2026-06-28T00:00:00.000Z",
  chooseProjectType: () => "fountain",
  contextFor: () => ({ nearbyTwinNames: [], recentMemories: [] })
};

const WORK = '{"verb":"work","target":null,"narrative":"working on the fountain"}';

describe("runTwinBeats", () => {
  it("spends all energy and records one narrative + memory per beat", async () => {
    const res = await runTwinBeats(twin(3), null, new CannedLlmClient([WORK]), deps);
    expect(res.twin.energy).toBe(0);
    expect(res.narratives.length).toBe(3);
    expect(res.memories.length).toBe(3);
  });

  it("completes a 3-step project within 3 work beats and builds one structure", async () => {
    const res = await runTwinBeats(twin(3), null, new CannedLlmClient([WORK]), deps);
    expect(res.structuresBuilt.length).toBe(1);
    expect(res.twin.skills.building).toBe(10);
    expect(res.activeProject).toBeNull();
  });

  it("does nothing when the twin has no energy", async () => {
    const res = await runTwinBeats(twin(0), null, new CannedLlmClient([WORK]), deps);
    expect(res.narratives.length).toBe(0);
    expect(res.twin.energy).toBe(0);
  });
});
