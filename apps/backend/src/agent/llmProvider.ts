import type { LlmClient } from "@aivillage/shared";
import { CannedLlmClient } from "../sim/cannedLlm.js";
import { AnthropicLlmClient } from "./anthropicLlm.js";

const DEFAULT_CANNED = JSON.stringify({ verb: "work", target: null, narrative: "working steadily" });

/**
 * Pick the twin brain from the environment:
 *   LLM_PROVIDER=anthropic  -> real Claude (needs ANTHROPIC_API_KEY)
 *   LLM_PROVIDER=canned     -> deterministic, no API/key (tests, offline)
 * Falls back to anthropic if a key is present, else canned.
 */
export function chooseLlm(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "canned");
  if (provider === "anthropic") {
    return new AnthropicLlmClient(process.env.LLM_MODEL ?? "claude-haiku-4-5");
  }
  return new CannedLlmClient([DEFAULT_CANNED]);
}
