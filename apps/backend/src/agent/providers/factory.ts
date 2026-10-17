import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { LlmClient } from "@aivillage/shared";
import { AnthropicLlmClient } from "../anthropicLlm.js";
import { LlmProviderError, OpenAiCompatibleClient, redact } from "./openaiCompatible.js";
import { getProvider, isChatModel, providerName, resolveBaseUrl, type AiSettings } from "./types.js";

export interface FactoryOptions {
  /** Injectable fetch for the OpenAI-compatible providers (tests). */
  fetch?: typeof fetch;
  /** Builds the Anthropic SDK client (tests inject a fake). */
  anthropic?: (opts: ClientOptions) => Anthropic;
  /** Environment used for the Docker host swap. Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Anthropic SDK retries (default: SDK default). */
  maxRetries?: number;
}

export type ConnectionResult = { ok: true; sample: string } | { ok: false; error: string };

const PROBE_PROMPT = "Reply with the word OK.";
const PROBE_TIMEOUT_MS = 15_000;

/** The one place that turns the player's AI settings into a working LlmClient. */
export function createLlm(settings: AiSettings, opts: FactoryOptions = {}): LlmClient {
  if (settings.provider === "anthropic") {
    return new AnthropicLlmClient(settings.model, anthropicSdk(settings, opts));
  }
  return openAiClient(settings, opts);
}

/**
 * Send one tiny prompt and report what happened, in words the player can read.
 * Never throws and never takes longer than ~15 s.
 */
export async function testConnection(settings: AiSettings, opts: FactoryOptions = {}): Promise<ConnectionResult> {
  const info = getProvider(settings.provider);
  if (info.needsKey && !settings.apiKey?.trim()) {
    return { ok: false, error: `${info.label} needs an API key.` };
  }
  if (!settings.model.trim()) return { ok: false, error: "Choose a model first." };
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
  try {
    const llm = createLlm(settings, { ...opts, timeoutMs, maxRetries: 0 });
    const sample = (await withTimeout(llm.generate(PROBE_PROMPT), timeoutMs, info.label)).trim();
    if (!sample) return { ok: false, error: `${info.label} answered with an empty reply. Try another model.` };
    return { ok: true, sample: sample.slice(0, 200) };
  } catch (err) {
    return { ok: false, error: describeError(err, settings) };
  }
}

/** Model ids the provider offers, sorted. Empty array on any failure (UI falls back to free text). */
export async function listModels(settings: AiSettings, opts: FactoryOptions = {}): Promise<string[]> {
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
  const label = providerName(settings.provider);
  try {
    if (settings.provider === "anthropic") {
      const sdk = anthropicSdk(settings, { ...opts, timeoutMs, maxRetries: 0 });
      const collect = async () => {
        const ids: string[] = [];
        for await (const m of sdk.models.list({ limit: 100 })) ids.push(m.id);
        return ids;
      };
      return [...new Set(await withTimeout(collect(), timeoutMs, label))].filter(isChatModel).sort();
    }
    return await withTimeout(openAiClient(settings, { ...opts, timeoutMs }).listModels(), timeoutMs, label);
  } catch {
    return [];
  }
}

/** A player-readable error message, with the API key removed. */
export function describeError(err: unknown, settings: AiSettings): string {
  const label = providerName(settings.provider);
  let message: string;
  if (err instanceof LlmProviderError) {
    message = err.message;
  } else if (err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number") {
    // Anthropic SDK APIError: { status, error: { error: { message } } }
    const e = err as { status: number; error?: { error?: { message?: unknown } }; message?: string };
    const inner = e.error?.error?.message;
    message = `${label} error ${e.status}: ${typeof inner === "string" ? inner : (e.message ?? "request failed")}`;
  } else if (err instanceof Error && /timeout|timed out/i.test(`${err.name} ${err.message}`)) {
    message = `${label} timed out.`;
  } else if (err instanceof Error) {
    message = `${label}: ${err.message || "request failed"}`;
  } else {
    message = `${label}: request failed`;
  }
  return redact(message, settings.apiKey);
}

function openAiClient(settings: AiSettings, opts: FactoryOptions): OpenAiCompatibleClient {
  if (settings.provider === "anthropic") throw new Error("anthropic is not OpenAI-compatible");
  return new OpenAiCompatibleClient({
    provider: settings.provider,
    baseUrl: resolveBaseUrl(settings, opts.env),
    apiKey: settings.apiKey?.trim() || null,
    model: settings.model,
    fetch: opts.fetch,
    timeoutMs: opts.timeoutMs
  });
}

function anthropicSdk(settings: AiSettings, opts: FactoryOptions): Anthropic {
  const sdkOpts: ClientOptions = {
    // Explicit null: never fall back to the server's ANTHROPIC_API_KEY env var.
    apiKey: settings.apiKey?.trim() || null
  };
  if (settings.baseUrl?.trim()) sdkOpts.baseURL = resolveBaseUrl(settings, opts.env);
  if (opts.timeoutMs !== undefined) sdkOpts.timeout = opts.timeoutMs;
  if (opts.maxRetries !== undefined) sdkOpts.maxRetries = opts.maxRetries;
  return (opts.anthropic ?? ((o) => new Anthropic(o)))(sdkOpts);
}

/** Belt and braces: even a client that ignores its abort signal cannot hang the UI. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new LlmProviderError(`${label} timed out after ${Math.round(ms / 1000)}s.`)),
      ms + 50
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
