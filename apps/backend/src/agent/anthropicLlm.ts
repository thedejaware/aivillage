import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "@aivillage/shared";

/**
 * Real LLM brain backed by Claude. Defaults to Haiku 4.5 (cheapest Anthropic
 * model) — plenty for the short {verb,target,narrative} beat output.
 * Reads ANTHROPIC_API_KEY from the environment (never hard-code it).
 */
export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(private readonly model = "claude-haiku-4-5") {
    this.client = new Anthropic(); // picks up ANTHROPIC_API_KEY from env
  }

  async generate(prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }]
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  }
}
