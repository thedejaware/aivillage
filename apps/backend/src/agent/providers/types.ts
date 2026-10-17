import type { ModelPrice } from "@aivillage/shared";

export type ProviderId = "openrouter" | "anthropic" | "gemini" | "openai" | "ollama";

/** The player's one AI choice. Every AI call in the village uses it. */
export interface AiSettings {
  provider: ProviderId;
  model: string;
  apiKey: string | null;
  /** Null = the provider's default base URL. */
  baseUrl: string | null;
}

/** A model we suggest in Settings. Prices are list prices in $ per million tokens (checked 2026-10-17). */
export interface ProviderModel {
  id: string;
  label: string;
  /** a few words: what it is good for */
  note: string;
  price: ModelPrice | null;
  recommended?: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  /** Where the player gets a key (null for local Ollama). */
  keyUrl: string | null;
  /** Where the player checks current prices (null for local Ollama). */
  pricingUrl: string | null;
  /** One short line for the Settings page. */
  hint: string;
  /** Suggested models, the default first. After a key is added, the provider's own list is shown too. */
  models: ProviderModel[];
}

const m = (id: string, label: string, note: string, input: number | null, output = 0, recommended = false): ProviderModel => ({
  id, label, note, price: input === null ? null : { input, output }, ...(recommended ? { recommended } : {})
});

/**
 * Model ids and prices verified 2026-10-17 against each provider's docs / pricing
 * page / live model list. Base URLs have no trailing slash; clients append
 * "/chat/completions" or "/models".
 */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    needsKey: true,
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-haiku-5-5",
    keyUrl: "https://platform.claude.com/settings/keys",
    pricingUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    hint: "Recommended. Claude Haiku is fast and very cheap.",
    models: [
      m("claude-haiku-5-5", "Claude Haiku 5.5", "fastest, cheapest", 0.1, 0.5, true),
      m("claude-sonnet-5-5", "Claude Sonnet 5.5", "smarter, still fast", 2, 10),
      m("claude-opus-5-5", "Claude Opus 5.5", "very smart, pricey", 4, 20),
      m("claude-fable-5-1", "Claude Fable 5.1", "the strongest, most expensive", 10, 50)
    ]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    needsKey: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-haiku-5.5",
    keyUrl: "https://openrouter.ai/settings/keys",
    pricingUrl: "https://openrouter.ai/models",
    hint: "One key, hundreds of models from every company.",
    models: [
      m("anthropic/claude-haiku-5.5", "Claude Haiku 5.5", "fast, cheap", 0.1, 0.5, true),
      m("openai/gpt-6-luna", "GPT-6 Luna", "fast, cheap", 0.1, 0.5),
      m("google/gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", "cheap", 0.25, 1.5),
      m("deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", "very cheap", 0.091, 0.182),
      m("meta-llama/llama-4-scout", "Llama 4 Scout", "very cheap, open model", 0.1, 0.3),
      m("anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", "smarter", 2, 10)
    ]
  },
  {
    id: "gemini",
    label: "Google Gemini",
    needsKey: true,
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.1-flash-lite",
    keyUrl: "https://aistudio.google.com/apikey",
    pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    hint: "Has a free tier. Flash-Lite is the cheapest.",
    models: [
      m("gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", "cheapest, free tier", 0.25, 1.5, true),
      m("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", "cheap, free tier", 0.3, 2.5),
      m("gemini-3.8-flash", "Gemini 3.8 Flash", "smarter, free tier", 0.75, 3.75),
      m("gemini-3.6-flash", "Gemini 3.6 Flash", "smarter, free tier", 0.75, 3.75),
      m("gemini-4-argon", "Gemini 4 Argon", "very smart, pricey", 2, 10),
      m("gemini-3.1-pro-preview", "Gemini 3.1 Pro (preview)", "very smart, pricey", 2, 12)
    ]
  },
  {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-6-luna",
    keyUrl: "https://platform.openai.com/api-keys",
    pricingUrl: "https://developers.openai.com/api/docs/pricing",
    hint: "GPT models. Luna is the cheapest.",
    models: [
      m("gpt-6-luna", "GPT-6 Luna", "fastest, cheapest", 0.1, 0.5, true),
      m("gpt-5.6-luna", "GPT-5.6 Luna", "cheap", 0.2, 1.2),
      m("gpt-6.1-sol", "GPT-6.1 Sol", "smarter", 2, 10),
      m("gpt-6-astra", "GPT-6 Astra", "the strongest, most expensive", 10, 50)
    ]
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    needsKey: false,
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    keyUrl: null,
    pricingUrl: null,
    hint: "Free, runs on your computer — but uses a lot of its memory. Run `ollama pull llama3.2` first.",
    models: [m("llama3.2", "Llama 3.2", "small, runs on most computers", null, 0, true)]
  }
];

/** Models that can chat (drops embeddings, images, audio, video, moderation and batch-only ids). */
const NON_CHAT = /embed|tts|whisper|dall-e|image|imagen|veo|moderation|transcribe|realtime|audio|search|babbage|davinci|sora|:batch|^aqa$|lyria/i;
export function isChatModel(id: string): boolean {
  return !NON_CHAT.test(id);
}

export function getProvider(id: ProviderId): ProviderInfo {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown AI provider: ${String(id)}`);
  return p;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The base URL to call: the custom one or the provider default, without a
 * trailing slash. Inside Docker (AIV_IN_DOCKER=1) a localhost Ollama URL
 * points at the container itself, so swap it to the host machine.
 */
export function resolveBaseUrl(settings: AiSettings, env: Record<string, string | undefined> = process.env): string {
  const raw = (settings.baseUrl?.trim() || getProvider(settings.provider).defaultBaseUrl).replace(/\/+$/, "");
  if (settings.provider !== "ollama" || env.AIV_IN_DOCKER !== "1") return raw;
  try {
    const url = new URL(raw);
    if (!LOCAL_HOSTS.has(url.hostname)) return raw;
    url.hostname = "host.docker.internal";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return raw;
  }
}

/** Label without the "(…)" suffix, for error messages: "Ollama", "Anthropic". */
export function providerName(id: ProviderId): string {
  return getProvider(id).label.replace(/ \(.*\)$/, "");
}
