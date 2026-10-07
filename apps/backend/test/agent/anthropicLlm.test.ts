import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicLlmClient } from "../../src/agent/anthropicLlm.js";

function fakeSdk(content: unknown[]) {
  const calls: Record<string, unknown>[] = [];
  const sdk = {
    messages: {
      create: async (req: Record<string, unknown>) => {
        calls.push(req);
        return { content, stop_reason: "tool_use" };
      }
    }
  } as unknown as Anthropic;
  return { sdk, calls };
}

describe("AnthropicLlmClient.generateWithTools", () => {
  it("returns the spoken text and every tool call", async () => {
    const { sdk, calls } = fakeSdk([
      { type: "text", text: "On my way!" },
      { type: "tool_use", id: "t1", name: "go_to", input: { place: "maker_space" } },
      { type: "tool_use", id: "t2", name: "remember_fact", input: { fact: "Owner loves tea" } }
    ]);
    const llm = new AnthropicLlmClient("claude-haiku-4-5", sdk);
    const turn = await llm.generateWithTools("hi", [
      { name: "go_to", description: "go", input_schema: { type: "object", properties: {} } }
    ]);
    expect(turn).toEqual({
      text: "On my way!",
      toolCalls: [
        { name: "go_to", input: { place: "maker_space" } },
        { name: "remember_fact", input: { fact: "Owner loves tea" } }
      ]
    });
    expect(calls[0]).toMatchObject({ model: "claude-haiku-4-5", tool_choice: { type: "auto" } });
    expect((calls[0].tools as { name: string }[])[0].name).toBe("go_to");
  });

  it("returns empty text when the model only called a tool", async () => {
    const { sdk } = fakeSdk([{ type: "tool_use", id: "t1", name: "stay_here", input: {} }]);
    const turn = await new AnthropicLlmClient("claude-haiku-4-5", sdk).generateWithTools("stay", []);
    expect(turn).toEqual({ text: "", toolCalls: [{ name: "stay_here", input: {} }] });
  });
});
