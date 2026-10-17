import type { LlmClient, LlmTool, ToolCall, ToolTurn } from "@aivillage/shared";
import { isChatModel, providerName, type ProviderId } from "./types.js";

export interface OpenAiCompatibleOptions {
  provider: Exclude<ProviderId, "anthropic">;
  /** Already resolved, no trailing slash (see resolveBaseUrl). */
  baseUrl: string;
  apiKey: string | null;
  model: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout. Default 60 s so a dead provider never stalls the village. */
  timeoutMs?: number;
  maxTokens?: number;
}

/** A provider failure. `message` is safe to show the player (never contains the key). */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

interface ChatMessage {
  content?: unknown;
  tool_calls?: { function?: { name?: unknown; arguments?: unknown } }[];
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * One client for every OpenAI-style /chat/completions API: OpenRouter, OpenAI,
 * Gemini's OpenAI-compatible endpoint and Ollama. Plain fetch, no SDK.
 */
export class OpenAiCompatibleClient implements LlmClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly label: string;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    this.fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTokens = opts.maxTokens ?? 1024;
    this.label = providerName(opts.provider);
  }

  async generate(prompt: string): Promise<string> {
    const message = await this.chat(prompt);
    return contentText(message.content);
  }

  /**
   * One turn with tool use. Like the Anthropic client, we run the tools
   * ourselves and never send results back.
   */
  async generateWithTools(prompt: string, tools: LlmTool[]): Promise<ToolTurn> {
    const message = await this.chat(prompt, tools);
    return { text: contentText(message.content).trim(), toolCalls: parseToolCalls(message.tool_calls) };
  }

  /** GET {baseUrl}/models → sorted unique model ids. Throws on failure. */
  async listModels(): Promise<string[]> {
    const json = (await this.request("GET", "/models")) as { data?: { id?: unknown }[] };
    const ids = (Array.isArray(json?.data) ? json.data : [])
      .map((m) => (typeof m?.id === "string" ? m.id.replace(/^models\//, "") : null))
      .filter((id): id is string => !!id)
      .filter(isChatModel);
    return [...new Set(ids)].sort();
  }

  private async chat(prompt: string, tools?: LlmTool[]): Promise<ChatMessage> {
    const body: Record<string, unknown> = {
      model: this.opts.model,
      messages: [{ role: "user", content: prompt }],
      ...this.limits()
    };
    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema }
      }));
      body.tool_choice = "auto";
    }
    const json = (await this.request("POST", "/chat/completions", body)) as { choices?: { message?: ChatMessage }[] };
    return json?.choices?.[0]?.message ?? {};
  }

  /**
   * Token cap + thinking level per provider. OpenAI's reasoning models reject
   * max_tokens; GPT-5.1+ and Gemini 3 think by default, which is slow, costs
   * output tokens and (for GPT on Chat Completions) blocks function calling.
   */
  private limits(): Record<string, unknown> {
    const { provider, model } = this.opts;
    if (provider === "openai") {
      const extra = /^gpt-(5\.\d|[6-9])/.test(model) ? { reasoning_effort: "none" } : {};
      return { max_completion_tokens: this.maxTokens, ...extra };
    }
    if (provider === "gemini") {
      if (/gemini-2\.5-flash/.test(model)) return { max_tokens: this.maxTokens, reasoning_effort: "none" };
      if (/gemini-[3-9][\d.]*-flash/.test(model)) return { max_tokens: this.maxTokens, reasoning_effort: "minimal" };
    }
    return { max_tokens: this.maxTokens };
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.opts.apiKey) h.Authorization = `Bearer ${this.opts.apiKey}`;
    if (this.opts.provider === "openrouter") {
      h["HTTP-Referer"] = "https://github.com/thedejaware/aivillage";
      h["X-Title"] = "AiVillage";
    }
    return h;
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
          method,
          headers: this.headers(),
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal
        });
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") {
          throw this.fail(`${this.label} timed out after ${Math.round(this.timeoutMs / 1000)}s.`);
        }
        const tip = this.opts.provider === "ollama" ? " Is Ollama running?" : "";
        throw this.fail(`Could not reach ${this.label} at ${this.opts.baseUrl}.${tip}`);
      }
      const raw = await res.text();
      if (!res.ok) {
        const detail = errorMessage(raw) ?? (res.statusText || "request failed");
        throw this.fail(`${this.label} error ${res.status}: ${detail}`, res.status);
      }
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw this.fail(`${this.label} returned a response that is not JSON.`, res.status);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private fail(message: string, status: number | null = null): LlmProviderError {
    return new LlmProviderError(redact(message, this.opts.apiKey), status);
  }
}

/** Remove the key from any text we surface (providers sometimes echo it back). */
export function redact(text: string, apiKey: string | null): string {
  return apiKey ? text.split(apiKey).join("***") : text;
}

/** Pull `error.message` out of OpenAI / OpenRouter / Gemini (array-wrapped) error bodies. */
function errorMessage(raw: string): string | null {
  try {
    let json = JSON.parse(raw) as unknown;
    if (Array.isArray(json)) json = json[0];
    const err = (json as { error?: unknown })?.error;
    if (typeof err === "string") return err;
    const msg = (err as { message?: unknown })?.message;
    if (typeof msg === "string" && msg) return msg;
  } catch {
    /* not JSON */
  }
  const text = raw.trim().slice(0, 200);
  return text || null;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("");
  }
  return "";
}

/** Arguments arrive as a JSON string; a call we cannot read is dropped, not fatal. */
function parseToolCalls(calls: ChatMessage["tool_calls"]): ToolCall[] {
  if (!Array.isArray(calls)) return [];
  const out: ToolCall[] = [];
  for (const call of calls) {
    const name = call?.function?.name;
    if (typeof name !== "string" || !name) continue;
    const input = parseArgs(call.function?.arguments);
    if (input) out.push({ name, input });
  }
  return out;
}

function parseArgs(args: unknown): Record<string, unknown> | null {
  let value = args;
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return {};
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
