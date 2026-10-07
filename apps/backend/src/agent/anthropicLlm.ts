import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmTool, ToolTurn } from "@aivillage/shared";

/**
 * Real LLM brain backed by Claude. Defaults to Haiku 4.5 (cheapest Anthropic
 * model) — plenty for the short {verb,target,narrative} beat output.
 * Reads ANTHROPIC_API_KEY from the environment (never hard-code it).
 */
export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(private readonly model = "claude-haiku-4-5", client?: Anthropic) {
    this.client = client ?? new Anthropic(); // picks up ANTHROPIC_API_KEY from env
  }

  async generate(prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }]
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  }

  /**
   * One turn with tool use. We execute the tools ourselves (move the twin,
   * remember facts) and never send results back — the spoken text that comes
   * with the calls is the reply.
   */
  async generateWithTools(prompt: string, tools: LlmTool[]): Promise<ToolTurn> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      tools: tools as Anthropic.Tool[],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: prompt }]
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const toolCalls = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
    return { text, toolCalls };
  }
}
