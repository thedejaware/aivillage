import type { Chattiness, LlmClient, VillageSettings } from "@aivillage/shared";
import { createLlm } from "../agent/providers/factory.js";
import type { AiSettings, ProviderId } from "../agent/providers/types.js";
import { chooseLlm } from "../agent/llmProvider.js";

/**
 * The village's brain = the player's own AI (Settings page). Rebuilt only when
 * the settings change. Developers can still run on env vars (ANTHROPIC_API_KEY
 * / LLM_PROVIDER) until a provider is saved.
 */
export class VillageAi {
  private cache: { key: string; llm: LlmClient } | null = null;

  constructor(
    private readonly load: () => Promise<VillageSettings | null>,
    private readonly envFallback: () => LlmClient | null = envLlm
  ) {}

  async llm(): Promise<LlmClient | null> {
    const s = await this.load();
    if (!s) return this.envFallback();
    const key = JSON.stringify([s.provider, s.model, s.apiKey, s.baseUrl]);
    if (this.cache?.key !== key) this.cache = { key, llm: createLlm(toAiSettings(s)) };
    return this.cache.llm;
  }

  async chattiness(): Promise<Chattiness> {
    return (await this.load())?.chattiness ?? "normal";
  }
}

export const toAiSettings = (s: VillageSettings): AiSettings => ({
  provider: s.provider as ProviderId,
  model: s.model,
  apiKey: s.apiKey,
  baseUrl: s.baseUrl
});

function envLlm(): LlmClient | null {
  if (!process.env.LLM_PROVIDER && !process.env.ANTHROPIC_API_KEY) return null;
  return chooseLlm();
}
