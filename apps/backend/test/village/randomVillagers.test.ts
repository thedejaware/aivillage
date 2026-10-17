import { describe, it, expect } from "vitest";
import { validateAppearance } from "@aivillage/shared";
import { generateVillagers, PRESET_VILLAGERS } from "../../src/village/randomVillagers.js";

const brain = (reply: string) => ({ generate: async () => reply });
const seeded = () => { let s = 3; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };

describe("generateVillagers", () => {
  it("uses the AI's names and personalities", async () => {
    const out = await generateVillagers(2, brain(JSON.stringify([
      { name: "Lale Demir", personality: "warm baker", goal: "feed everyone" },
      { name: "Tom Hart", personality: "grumpy poet", goal: "win the slam" }
    ])), [], seeded());
    expect(out.map((v) => v.name)).toEqual(["Lale Demir", "Tom Hart"]);
    expect(out[0]).toMatchObject({ role: "villager", personality: "warm baker", goal: "feed everyone" });
    for (const v of out) expect(validateAppearance(v.appearance)).toEqual(v.appearance);
  });

  it("falls back to presets when there is no AI or it answers nonsense", async () => {
    const none = await generateVillagers(3, null, [], seeded());
    const junk = await generateVillagers(3, brain("sorry, I can't"), [], seeded());
    for (const out of [none, junk]) {
      expect(out.length).toBe(3);
      for (const v of out) expect(PRESET_VILLAGERS.map((p) => p.name)).toContain(v.name);
    }
  });

  it("never reuses a name already in the village", async () => {
    const taken = PRESET_VILLAGERS.slice(0, PRESET_VILLAGERS.length - 2).map((p) => p.name);
    const out = await generateVillagers(2, null, taken, seeded());
    for (const v of out) expect(taken).not.toContain(v.name);
  });

  it("asks for zero → returns nothing", async () => {
    expect(await generateVillagers(0, null, [], seeded())).toEqual([]);
  });
});
