import { describe, it, expect } from "vitest";
import type { VillageSettings } from "@aivillage/shared";
import { VillageAi } from "../../src/village/aiRuntime.js";
import { OpenAiCompatibleClient } from "../../src/agent/providers/openaiCompatible.js";

const gemini: VillageSettings = { provider: "gemini", model: "gemini-3.1-flash-lite", apiKey: "k1", baseUrl: null, chattiness: "busy" };

describe("VillageAi", () => {
  it("has no AI before setup (and no env fallback)", async () => {
    const ai = new VillageAi(async () => null, () => null);
    expect(await ai.llm()).toBeNull();
    expect(await ai.chattiness()).toBe("normal");
  });
  it("builds the player's provider and reuses it", async () => {
    const ai = new VillageAi(async () => gemini, () => null);
    const a = await ai.llm();
    expect(a).toBeInstanceOf(OpenAiCompatibleClient);
    expect(await ai.llm()).toBe(a);
    expect(await ai.chattiness()).toBe("busy");
  });
  it("rebuilds when the settings change", async () => {
    let s = gemini;
    const ai = new VillageAi(async () => s, () => null);
    const a = await ai.llm();
    s = { ...gemini, model: "other-model" };
    expect(await ai.llm()).not.toBe(a);
  });
  it("uses the developer's env AI when nothing is saved", async () => {
    const fallback = { generate: async () => "x" };
    const ai = new VillageAi(async () => null, () => fallback);
    expect(await ai.llm()).toBe(fallback);
  });
});
