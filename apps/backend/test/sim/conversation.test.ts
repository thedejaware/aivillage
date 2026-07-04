import { describe, it, expect } from "vitest";
import type { Twin, LlmClient } from "@aivillage/shared";
import { buildConversePrompt, parseConversation, converse } from "../../src/sim/conversation.js";

const makeTwin = (name: string, traits: string[], goals: string[]): Twin => ({
  id: `id-${name.toLowerCase()}`,
  ownerUserId: "u1",
  name,
  traits,
  goals,
  avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 3 },
  reputation: 0,
  locationZone: "plaza",
  energy: 5,
  energyUpdatedAt: "2026-07-05T00:00:00.000Z",
  isNpc: false,
});

const fakeLlm = (out: string): LlmClient => ({ generate: async () => out });

const twinA = makeTwin("Lena", ["ambitious", "sharp-tongued"], ["become village leader"]);
const twinB = makeTwin("Murat", ["laid-back", "loyal"], ["find true friendship"]);

const validResponse = JSON.stringify({
  lines: [
    { speaker: "Lena", text: "You really think you can compete with me?" },
    { speaker: "Murat", text: "I'm not competing. I'm just being myself." },
  ],
  deltaAtoB: 3,
  deltaBtoA: -2,
  moment: null,
});

describe("buildConversePrompt", () => {
  it("contains both twin names", () => {
    const p = buildConversePrompt({ a: twinA, b: twinB, scoreAtoB: 10, scoreBtoA: -5 });
    expect(p).toContain("Lena");
    expect(p).toContain("Murat");
  });

  it("contains relationship labels derived from scores", () => {
    const p = buildConversePrompt({ a: twinA, b: twinB, scoreAtoB: 10, scoreBtoA: -30 });
    expect(p).toContain("acquaintance"); // 10 -> acquaintance
    expect(p).toContain("rival");        // -30 -> rival
  });

  it("instructs the model to respond with strict JSON", () => {
    const p = buildConversePrompt({ a: twinA, b: twinB, scoreAtoB: 0, scoreBtoA: 0 });
    expect(p.toLowerCase()).toContain("strict json");
  });

  it("includes traits and goals for both twins", () => {
    const p = buildConversePrompt({ a: twinA, b: twinB, scoreAtoB: 0, scoreBtoA: 0 });
    expect(p).toContain("ambitious");
    expect(p).toContain("laid-back");
    expect(p).toContain("become village leader");
    expect(p).toContain("find true friendship");
  });
});

describe("parseConversation", () => {
  it("parses a clean JSON response", () => {
    const result = parseConversation(validResponse, "Lena", "Murat");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({ speaker: "Lena", text: "You really think you can compete with me?" });
    expect(result.lines[1]).toEqual({ speaker: "Murat", text: "I'm not competing. I'm just being myself." });
    expect(result.deltaAtoB).toBe(3);
    expect(result.deltaBtoA).toBe(-2);
    expect(result.moment).toBeNull();
  });

  it("tolerates prose wrapped around the JSON block", () => {
    const wrapped = `Here is the conversation!\n${validResponse}\nHope that helps.`;
    const result = parseConversation(wrapped, "Lena", "Murat");
    expect(result.lines).toHaveLength(2);
    expect(result.deltaAtoB).toBe(3);
  });

  it("clamps deltaAtoB that exceeds +20 down to 20", () => {
    const raw = JSON.stringify({
      lines: [{ speaker: "Lena", text: "hi" }, { speaker: "Murat", text: "hey" }],
      deltaAtoB: 50,
      deltaBtoA: 5,
      moment: null,
    });
    const result = parseConversation(raw, "Lena", "Murat");
    expect(result.deltaAtoB).toBe(20);
  });

  it("clamps deltaBtoA below -20 to -20", () => {
    const raw = JSON.stringify({
      lines: [{ speaker: "Lena", text: "hi" }, { speaker: "Murat", text: "hey" }],
      deltaAtoB: 0,
      deltaBtoA: -99,
      moment: null,
    });
    const result = parseConversation(raw, "Lena", "Murat");
    expect(result.deltaBtoA).toBe(-20);
  });

  it("preserves a non-null moment string", () => {
    const raw = JSON.stringify({
      lines: [{ speaker: "Lena", text: "I'll never forgive you!" }, { speaker: "Murat", text: "Fine." }],
      deltaAtoB: -10,
      deltaBtoA: -8,
      moment: "Lena and Murat have become rivals.",
    });
    const result = parseConversation(raw, "Lena", "Murat");
    expect(result.moment).toBe("Lena and Murat have become rivals.");
  });

  it("coerces missing moment field to null", () => {
    const raw = JSON.stringify({
      lines: [{ speaker: "Lena", text: "hi" }, { speaker: "Murat", text: "hey" }],
      deltaAtoB: 1,
      deltaBtoA: 1,
    });
    const result = parseConversation(raw, "Lena", "Murat");
    expect(result.moment).toBeNull();
  });

  it("throws when an invalid speaker name is in lines", () => {
    const raw = JSON.stringify({
      lines: [{ speaker: "Unknown", text: "hi" }, { speaker: "Murat", text: "hey" }],
      deltaAtoB: 1,
      deltaBtoA: 1,
      moment: null,
    });
    expect(() => parseConversation(raw, "Lena", "Murat")).toThrow();
  });

  it("throws when lines array is empty", () => {
    const raw = JSON.stringify({
      lines: [],
      deltaAtoB: 1,
      deltaBtoA: 1,
      moment: null,
    });
    expect(() => parseConversation(raw, "Lena", "Murat")).toThrow();
  });

  it("throws when no JSON is present in the response", () => {
    expect(() => parseConversation("No JSON here at all.", "Lena", "Murat")).toThrow();
  });
});

describe("converse", () => {
  it("calls the llm and returns a parsed ConversationResult", async () => {
    const result = await converse(
      { a: twinA, b: twinB, scoreAtoB: 0, scoreBtoA: 0 },
      fakeLlm(validResponse)
    );
    expect(result.lines).toHaveLength(2);
    expect(result.deltaAtoB).toBe(3);
    expect(result.deltaBtoA).toBe(-2);
    expect(result.moment).toBeNull();
  });
});
