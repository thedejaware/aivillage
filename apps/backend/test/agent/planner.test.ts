import { describe, it, expect } from "vitest";
import type { Twin, LlmClient } from "@aivillage/shared";
import { buildPrompt, parseBeat, planBeat } from "../../src/agent/planner.js";

const twin = (): Twin => ({
  id: "t1", ownerUserId: "u1", name: "Mehmet", traits: ["chaotic inventor"], goals: ["build a fountain"],
  avatarSpriteUrl: null, skills: { building: 1, coding: 0, art: 0, social: 0 },
  reputation: 0, locationZone: "plaza", energy: 5,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: false
});

const fakeLlm = (out: string): LlmClient => ({ generate: async () => out });

describe("buildPrompt", () => {
  it("includes the twin name, zone, and nearby names", () => {
    const p = buildPrompt(twin(), { nearbyTwinNames: ["Lena"], recentMemories: [] });
    expect(p).toContain("Mehmet");
    expect(p).toContain("plaza");
    expect(p).toContain("Lena");
  });

  it("nudges toward work and shows active project progress", () => {
    const p = buildPrompt(twin(), {
      nearbyTwinNames: [],
      recentMemories: [],
      activeProject: { type: "workshop", stepsDone: 2, stepsTotal: 3 }
    });
    expect(p).toContain("2/3");
    expect(p.toLowerCase()).toContain('prefer "work"');
  });
});

describe("parseBeat", () => {
  it("parses a clean JSON object", () => {
    const r = parseBeat('{"verb":"work","target":"plaza","narrative":"Working on the fountain."}');
    expect(r).toEqual({ verb: "work", target: "plaza", narrative: "Working on the fountain." });
  });
  it("tolerates surrounding prose around the JSON", () => {
    const r = parseBeat('Sure!\n{"verb":"move","target":"event_space","narrative":"Heading over."}\nDone.');
    expect(r.verb).toBe("move");
  });
  it("throws on an invalid verb", () => {
    expect(() => parseBeat('{"verb":"fly","target":null,"narrative":"x"}')).toThrow();
  });
  it("throws when no JSON is present", () => {
    expect(() => parseBeat("no json here")).toThrow();
  });
});

describe("planBeat", () => {
  it("calls the llm and returns a parsed BeatResult", async () => {
    const r = await planBeat(twin(), { nearbyTwinNames: [], recentMemories: [] },
      fakeLlm('{"verb":"socialize","target":"Lena","narrative":"Say hi."}'));
    expect(r).toEqual({ verb: "socialize", target: "Lena", narrative: "Say hi." });
  });
});
