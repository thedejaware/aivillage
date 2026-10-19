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

  it("includes relationships and offers the social verbs", () => {
    const p = buildPrompt(twin(), {
      nearbyTwinNames: ["Lena"],
      recentMemories: [],
      relationships: [{ name: "Lena", label: "rival" }]
    });
    expect(p).toContain("Lena: rival");
    expect(p).toContain('"chat"');
    expect(p).toContain('"bigmove"');
    expect(p).toContain("confront");
  });
});

describe("buildPrompt: places and rest", () => {
  it("lists the kitchen and the library with their net effects; tired twins sleep at home", () => {
    const p = buildPrompt(twin(), { nearbyTwinNames: [], recentMemories: [] });
    expect(p).toMatch(/kitchen \(cook a dish: -6 energy while cooking, then \+12 eating\)/);
    expect(p).toMatch(/library \(read \+2 energy, study -2 energy\)/);
    expect(p).toMatch(/tired: go home and sleep/);
    expect(p).not.toMatch(/rest \(café/);
  });
});

describe("parseBeat (social verbs)", () => {
  it("parses a chat beat", () => {
    const r = parseBeat('{"verb":"chat","target":"Lena","kind":null,"narrative":"Says hi."}');
    expect(r).toMatchObject({ verb: "chat", target: "Lena", kind: null });
  });
  it("parses a bigmove with a valid kind", () => {
    const r = parseBeat('{"verb":"bigmove","target":"Lena","kind":"confront","narrative":"Enough."}');
    expect(r).toMatchObject({ verb: "bigmove", target: "Lena", kind: "confront" });
  });
  it("throws on a bigmove with a bad kind", () => {
    expect(() => parseBeat('{"verb":"bigmove","target":"Lena","kind":"explode","narrative":"x"}')).toThrow();
  });
  it("throws on a bigmove with no kind", () => {
    expect(() => parseBeat('{"verb":"bigmove","target":"Lena","narrative":"x"}')).toThrow();
  });
});

describe("parseBeat", () => {
  it("parses a clean JSON object", () => {
    const r = parseBeat('{"verb":"work","target":"plaza","narrative":"Working on the fountain."}');
    expect(r).toEqual({ verb: "work", target: "plaza", kind: null, narrative: "Working on the fountain." });
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
    expect(r).toEqual({ verb: "socialize", target: "Lena", kind: null, narrative: "Say hi." });
  });
});

describe("v4: the planner can choose an action", () => {
  it("offers 'act' with the action catalogue", () => {
    const p = buildPrompt(twin(), { nearbyTwinNames: ["Lena"], recentMemories: [] });
    expect(p).toContain('"act"');
    expect(p).toContain("wash_hands");
    expect(p).toContain("hug");
  });

  it("parses a solo action", () => {
    const r = parseBeat('{"verb":"act","target":null,"action":"drink_coffee","narrative":"Grabs a coffee."}');
    expect(r).toEqual({ verb: "act", target: null, kind: null, action: "drink_coffee", emoji: null, narrative: "Grabs a coffee." });
  });

  it("parses a social action with a partner and a free action with an emoji", () => {
    expect(parseBeat('{"verb":"act","target":"Lena","action":"hug","narrative":"x"}')).toMatchObject({ action: "hug", target: "Lena" });
    expect(parseBeat('{"verb":"act","target":null,"action":"play guitar","emoji":"🎸","narrative":"x"}')).toMatchObject({ action: "play guitar", emoji: "🎸" });
  });

  it("throws on an act with no action", () => {
    expect(() => parseBeat('{"verb":"act","target":null,"narrative":"x"}')).toThrow();
  });
});
