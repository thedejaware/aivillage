import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { ClientOptions } from "@anthropic-ai/sdk";
import { createLlm, testConnection, listModels } from "../../../src/agent/providers/factory.js";
import { OpenAiCompatibleClient } from "../../../src/agent/providers/openaiCompatible.js";
import { AnthropicLlmClient } from "../../../src/agent/anthropicLlm.js";
import type { AiSettings } from "../../../src/agent/providers/types.js";

const KEY = "sk-secret-abcdef";

const settings = (over: Partial<AiSettings>): AiSettings => ({
  provider: "openrouter",
  model: "anthropic/claude-haiku-5.5",
  apiKey: KEY,
  baseUrl: null,
  ...over
});

function fakeFetch(status: number, json: unknown) {
  const urls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    urls.push(String(url));
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

const hang = ((_url: string, init?: RequestInit) =>
  new Promise((_res, rej) => {
    init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
  })) as typeof fetch;

/** Fake Anthropic SDK: records constructor options and each messages.create request. */
function fakeAnthropic(opts: { text?: string; fail?: unknown; models?: string[] } = {}) {
  const made: ClientOptions[] = [];
  const requests: Record<string, unknown>[] = [];
  const make = (o: ClientOptions) => {
    made.push(o);
    return {
      messages: {
        create: async (req: Record<string, unknown>) => {
          requests.push(req);
          if (opts.fail) throw opts.fail;
          return { content: [{ type: "text", text: opts.text ?? "OK" }] };
        }
      },
      models: {
        list: () => {
          if (!opts.models) throw new Error("boom");
          const items = opts.models.map((id) => ({ id }));
          return {
            async *[Symbol.asyncIterator]() {
              yield* items;
            }
          };
        }
      }
    } as unknown as Anthropic;
  };
  return { make, made, requests };
}

describe("createLlm", () => {
  it("builds an OpenAI-compatible client for openrouter/openai/gemini/ollama", async () => {
    for (const provider of ["openrouter", "openai", "gemini", "ollama"] as const) {
      expect(createLlm(settings({ provider }))).toBeInstanceOf(OpenAiCompatibleClient);
    }
  });

  it("points the client at the resolved base URL and model", async () => {
    const { fetchImpl, urls } = fakeFetch(200, { choices: [{ message: { content: "hi" } }] });
    const llm = createLlm(settings({ provider: "ollama", model: "llama3.2", apiKey: null }), {
      fetch: fetchImpl,
      env: { AIV_IN_DOCKER: "1" }
    });
    expect(await llm.generate("x")).toBe("hi");
    expect(urls[0]).toBe("http://host.docker.internal:11434/v1/chat/completions");
  });

  it("builds an AnthropicLlmClient configured with the key and model", async () => {
    const sdk = fakeAnthropic({ text: "Howdy" });
    const llm = createLlm(settings({ provider: "anthropic", model: "claude-haiku-5-5" }), { anthropic: sdk.make });
    expect(llm).toBeInstanceOf(AnthropicLlmClient);
    expect(sdk.made[0]).toMatchObject({ apiKey: KEY });
    expect(await llm.generate("hi")).toBe("Howdy");
    expect(sdk.requests[0]).toMatchObject({ model: "claude-haiku-5-5" });
  });

  it("passes a custom Anthropic base URL to the SDK", () => {
    const sdk = fakeAnthropic();
    createLlm(settings({ provider: "anthropic", baseUrl: "https://gw.example.com/" }), { anthropic: sdk.make });
    expect(sdk.made[0]).toMatchObject({ baseURL: "https://gw.example.com" });
  });
});

describe("testConnection", () => {
  it("returns ok with the sample text", async () => {
    const { fetchImpl } = fakeFetch(200, { choices: [{ message: { content: "OK." } }] });
    expect(await testConnection(settings({}), { fetch: fetchImpl })).toEqual({ ok: true, sample: "OK." });
  });

  it("returns the provider error without the key", async () => {
    const { fetchImpl } = fakeFetch(401, { error: { message: `No auth credentials found for ${KEY}` } });
    const res = await testConnection(settings({}), { fetch: fetchImpl });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("401");
    expect(res.error).toContain("No auth credentials found");
    expect(res.error).not.toContain(KEY);
  });

  it("fails fast without a network call when a required key is missing", async () => {
    const { fetchImpl, urls } = fakeFetch(200, {});
    const res = await testConnection(settings({ provider: "openai", apiKey: null }), { fetch: fetchImpl });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/API key/i) });
    expect(urls).toHaveLength(0);
  });

  it("times out instead of hanging", async () => {
    const res = await testConnection(settings({}), { fetch: hang, timeoutMs: 20 });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/timed out/i) });
  });

  it("returns an empty-reply error when the model says nothing", async () => {
    const { fetchImpl } = fakeFetch(200, { choices: [{ message: { content: "" } }] });
    const res = await testConnection(settings({}), { fetch: fetchImpl });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/empty/i) });
  });

  it("maps an Anthropic SDK error to status + message without the key", async () => {
    const fail = Object.assign(new Error(`401 {"error":{"message":"invalid x-api-key ${KEY}"}}`), {
      status: 401,
      error: { type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` } }
    });
    const sdk = fakeAnthropic({ fail });
    const res = await testConnection(settings({ provider: "anthropic", model: "claude-haiku-5-5" }), { anthropic: sdk.make });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Anthropic");
    expect(res.error).toContain("401");
    expect(res.error).toContain("invalid x-api-key");
    expect(res.error).not.toContain(KEY);
    expect(sdk.requests[0]).toMatchObject({ messages: [{ role: "user", content: "Reply with the word OK." }] });
  });

  it("works with Anthropic", async () => {
    const sdk = fakeAnthropic({ text: "OK" });
    expect(await testConnection(settings({ provider: "anthropic" }), { anthropic: sdk.make })).toEqual({ ok: true, sample: "OK" });
    expect(sdk.made[0]).toMatchObject({ maxRetries: 0 });
  });
});

describe("listModels", () => {
  it("returns sorted ids from an OpenAI-compatible provider", async () => {
    const { fetchImpl, urls } = fakeFetch(200, { data: [{ id: "qwen3:8b" }, { id: "llama3.2:latest" }] });
    const ids = await listModels(settings({ provider: "ollama", apiKey: null }), { fetch: fetchImpl });
    expect(ids).toEqual(["llama3.2:latest", "qwen3:8b"]);
    expect(urls[0]).toBe("http://localhost:11434/v1/models");
  });

  it("returns [] on HTTP error, network error, or timeout", async () => {
    expect(await listModels(settings({}), { fetch: fakeFetch(500, {}).fetchImpl })).toEqual([]);
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await listModels(settings({}), { fetch: down })).toEqual([]);
    expect(await listModels(settings({}), { fetch: hang, timeoutMs: 20 })).toEqual([]);
  });

  it("lists Anthropic models through the SDK", async () => {
    const sdk = fakeAnthropic({ models: ["claude-sonnet-5", "claude-haiku-5-5"] });
    expect(await listModels(settings({ provider: "anthropic" }), { anthropic: sdk.make })).toEqual([
      "claude-haiku-5-5",
      "claude-sonnet-5"
    ]);
  });

  it("returns [] when the Anthropic SDK fails", async () => {
    const sdk = fakeAnthropic({});
    expect(await listModels(settings({ provider: "anthropic" }), { anthropic: sdk.make })).toEqual([]);
  });
});
