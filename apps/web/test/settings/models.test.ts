import { describe, it, expect } from "vitest";
import { modelChoices, costLine } from "../../lib/settings/models";
import type { ProviderInfo } from "../../lib/settings/api";

const anthropic: ProviderInfo = {
  id: "anthropic", label: "Anthropic (Claude)", needsKey: true, defaultBaseUrl: "https://api.anthropic.com",
  defaultModel: "claude-haiku-5-5", keyUrl: "https://x", pricingUrl: "https://p", hint: "",
  models: [
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "fastest, cheapest", price: { input: 0.1, output: 0.5 }, recommended: true },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "smarter", price: { input: 2, output: 10 } }
  ]
};
const ollama: ProviderInfo = {
  ...anthropic, id: "ollama", needsKey: false, keyUrl: null, pricingUrl: null, defaultModel: "llama3.2",
  models: [{ id: "llama3.2", label: "Llama 3.2", note: "small", price: null, recommended: true }]
};

describe("modelChoices", () => {
  it("shows the suggested models before any key is added, recommended first", () => {
    const c = modelChoices(anthropic, [], "claude-haiku-5-5");
    expect(c.suggested.map((s) => s.id)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(c.suggested[0].text).toBe("Claude Haiku 5.5 — fastest, cheapest (recommended)");
    expect(c.more).toEqual([]);
    expect(c.isCustom).toBe(false);
  });

  it("adds the rest of the account's models, without repeating the suggested ones", () => {
    const c = modelChoices(anthropic, ["claude-sonnet-5-5", "claude-opus-4-8", "claude-haiku-5-5", "claude-fable-5"], "claude-haiku-5-5");
    expect(c.more).toEqual(["claude-fable-5", "claude-opus-4-8"]);
  });

  it("a model typed by hand is custom", () => {
    expect(modelChoices(anthropic, ["claude-opus-4-8"], "my-fine-tune").isCustom).toBe(true);
    expect(modelChoices(anthropic, ["claude-opus-4-8"], "claude-opus-4-8").isCustom).toBe(false);
  });
});

describe("costLine", () => {
  it("estimates dollars per hour for a priced model", () => {
    expect(costLine(anthropic, "claude-haiku-5-5", "normal")).toBe("≈ $0.08 / hour");
  });
  it("is free for local models", () => {
    expect(costLine(ollama, "llama3.2", "busy")).toMatch(/free/i);
  });
  it("falls back to calls per hour when the price is unknown", () => {
    expect(costLine(anthropic, "claude-opus-4-8", "normal")).toBe("about 260 AI calls / hour");
  });
});
