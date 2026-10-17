import { describe, it, expect } from "vitest";
import { OpenAiCompatibleClient, type OpenAiCompatibleOptions } from "../../../src/agent/providers/openaiCompatible.js";

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

/** A fake fetch that records every request and answers with the given status + JSON. */
function fakeFetch(status: number, json: unknown) {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    });
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const KEY = "sk-secret-123456";

function client(over: Partial<OpenAiCompatibleOptions>, fetchImpl: typeof fetch) {
  return new OpenAiCompatibleClient({
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: KEY,
    model: "anthropic/claude-haiku-5.5",
    fetch: fetchImpl,
    ...over
  });
}

const reply = (message: Record<string, unknown>) => ({ choices: [{ index: 0, message: { role: "assistant", ...message } }] });

const goTo = {
  name: "go_to",
  description: "Walk somewhere",
  input_schema: { type: "object" as const, properties: { place: { type: "string" } }, required: ["place"] }
};

describe("OpenAiCompatibleClient.generate", () => {
  it("POSTs a chat completion and returns the message content", async () => {
    const { fetchImpl, calls } = fakeFetch(200, reply({ content: "Hello there" }));
    const text = await client({}, fetchImpl).generate("hi");
    expect(text).toBe("Hello there");
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({
      model: "anthropic/claude-haiku-5.5",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1024
    });
    expect(calls[0].body).not.toHaveProperty("tools");
  });

  it("sends Bearer auth and the OpenRouter attribution headers", async () => {
    const { fetchImpl, calls } = fakeFetch(200, reply({ content: "x" }));
    await client({}, fetchImpl).generate("hi");
    expect(calls[0].headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(calls[0].headers["http-referer"]).toBe("https://github.com/thedejaware/aivillage");
    expect(calls[0].headers["x-title"]).toBe("AiVillage");
  });

  it("sends no auth and no OpenRouter headers for keyless ollama", async () => {
    const { fetchImpl, calls } = fakeFetch(200, reply({ content: "x" }));
    await client({ provider: "ollama", baseUrl: "http://localhost:11434/v1", apiKey: null, model: "llama3.2" }, fetchImpl).generate("hi");
    expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(calls[0].headers).not.toHaveProperty("authorization");
    expect(calls[0].headers).not.toHaveProperty("http-referer");
    expect(calls[0].headers).not.toHaveProperty("x-title");
  });

  it("uses max_completion_tokens + reasoning_effort none for new OpenAI models", async () => {
    const { fetchImpl, calls } = fakeFetch(200, reply({ content: "x" }));
    await client({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-6-luna" }, fetchImpl).generate("hi");
    expect(calls[0].body).toMatchObject({ max_completion_tokens: 1024, reasoning_effort: "none" });
    expect(calls[0].body).not.toHaveProperty("max_tokens");
  });

  it("does not send reasoning_effort to older OpenAI models", async () => {
    const { fetchImpl, calls } = fakeFetch(200, reply({ content: "x" }));
    await client({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" }, fetchImpl).generate("hi");
    expect(calls[0].body).toMatchObject({ max_completion_tokens: 1024 });
    expect(calls[0].body).not.toHaveProperty("reasoning_effort");
  });

  it("keeps Gemini 3 Flash-Lite thinking minimal and turns 2.5 Flash thinking off", async () => {
    const base = { provider: "gemini" as const, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" };
    const a = fakeFetch(200, reply({ content: "x" }));
    await client({ ...base, model: "gemini-3.1-flash-lite" }, a.fetchImpl).generate("hi");
    expect(a.calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(a.calls[0].body).toMatchObject({ max_tokens: 1024, reasoning_effort: "minimal" });
    const b = fakeFetch(200, reply({ content: "x" }));
    await client({ ...base, model: "gemini-2.5-flash-lite" }, b.fetchImpl).generate("hi");
    expect(b.calls[0].body).toMatchObject({ reasoning_effort: "none" });
  });

  it("returns an empty string when content is null", async () => {
    const { fetchImpl } = fakeFetch(200, reply({ content: null }));
    expect(await client({}, fetchImpl).generate("hi")).toBe("");
  });

  it("joins text parts when content comes as an array", async () => {
    const { fetchImpl } = fakeFetch(200, reply({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }));
    expect(await client({}, fetchImpl).generate("hi")).toBe("ab");
  });
});

describe("OpenAiCompatibleClient.generateWithTools", () => {
  it("maps tools to the OpenAI function shape with tool_choice auto", async () => {
    const { fetchImpl, calls } = fakeFetch(200, reply({ content: "ok" }));
    await client({}, fetchImpl).generateWithTools("go", [goTo]);
    expect(calls[0].body).toMatchObject({
      tool_choice: "auto",
      tools: [{ type: "function", function: { name: "go_to", description: "Walk somewhere", parameters: goTo.input_schema } }]
    });
  });

  it("returns text only", async () => {
    const { fetchImpl } = fakeFetch(200, reply({ content: "  Just chatting.  " }));
    expect(await client({}, fetchImpl).generateWithTools("hi", [goTo])).toEqual({ text: "Just chatting.", toolCalls: [] });
  });

  it("returns tool calls only (null content)", async () => {
    const { fetchImpl } = fakeFetch(
      200,
      reply({
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "go_to", arguments: '{"place":"cafe"}' } }]
      })
    );
    expect(await client({}, fetchImpl).generateWithTools("go", [goTo])).toEqual({
      text: "",
      toolCalls: [{ name: "go_to", input: { place: "cafe" } }]
    });
  });

  it("returns both text and several tool calls", async () => {
    const { fetchImpl } = fakeFetch(
      200,
      reply({
        content: "On my way!",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "go_to", arguments: '{"place":"maker_space"}' } },
          { id: "c2", type: "function", function: { name: "stay_here", arguments: "" } }
        ]
      })
    );
    expect(await client({}, fetchImpl).generateWithTools("go", [goTo])).toEqual({
      text: "On my way!",
      toolCalls: [
        { name: "go_to", input: { place: "maker_space" } },
        { name: "stay_here", input: {} }
      ]
    });
  });

  it("skips a call whose arguments are not valid JSON objects, keeps the rest", async () => {
    const { fetchImpl } = fakeFetch(
      200,
      reply({
        content: "hmm",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "go_to", arguments: "{place: cafe" } },
          { id: "c2", type: "function", function: { name: "go_to", arguments: "[1,2]" } },
          { id: "c3", type: "function", function: { name: "remember_fact", arguments: { fact: "likes tea" } } },
          { id: "c4", type: "function", function: { arguments: "{}" } }
        ]
      })
    );
    expect(await client({}, fetchImpl).generateWithTools("go", [goTo])).toEqual({
      text: "hmm",
      toolCalls: [{ name: "remember_fact", input: { fact: "likes tea" } }]
    });
  });
});

describe("OpenAiCompatibleClient errors", () => {
  it("includes status and the provider's message on 401, never the key", async () => {
    const { fetchImpl } = fakeFetch(401, { error: { code: 401, message: `Invalid API key ${KEY}` } });
    const err = await client({}, fetchImpl).generate("hi").then(() => new Error("expected a failure"), (e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("401");
    expect(err.message).toContain("Invalid API key");
    expect(err.message).toContain("OpenRouter");
    expect(err.message).not.toContain(KEY);
  });

  it("handles a Gemini-style array error body and a non-JSON body", async () => {
    const a = fakeFetch(400, [{ error: { code: 400, message: "API key not valid." } }]);
    const e1 = await client({ provider: "gemini" }, a.fetchImpl).generate("hi").then(() => new Error("expected a failure"), (e: unknown) => e as Error);
    expect(e1.message).toContain("400");
    expect(e1.message).toContain("API key not valid.");

    const fetchText = (async () => new Response("Bad Gateway", { status: 502 })) as typeof fetch;
    const e2 = await client({}, fetchText).generate("hi").then(() => new Error("expected a failure"), (e: unknown) => e as Error);
    expect(e2.message).toContain("502");
  });

  it("reports an unreachable server without leaking the key", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const err = await client({ provider: "ollama", baseUrl: "http://localhost:11434/v1", apiKey: null }, down)
      .generate("hi")
      .then(() => new Error("expected a failure"), (e: unknown) => e as Error);
    expect(err.message).toContain("http://localhost:11434/v1");
    expect(err.message).toMatch(/Ollama/);
  });

  it("aborts after timeoutMs", async () => {
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as typeof fetch;
    const err = await client({ timeoutMs: 20 }, hang).generate("hi").then(() => new Error("expected a failure"), (e: unknown) => e as Error);
    expect(err.message).toMatch(/timed out/i);
  });
});

describe("OpenAiCompatibleClient.listModels", () => {
  it("GETs /models and returns sorted unique ids without a 'models/' prefix", async () => {
    const { fetchImpl, calls } = fakeFetch(200, {
      object: "list",
      data: [{ id: "models/gemini-3.1-flash-lite" }, { id: "gemini-2.5-flash-lite" }, { id: "gemini-2.5-flash-lite" }, { nope: 1 }]
    });
    const ids = await client({ provider: "gemini" }, fetchImpl).listModels();
    expect(ids).toEqual(["gemini-2.5-flash-lite", "gemini-3.1-flash-lite"]);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/models");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers["authorization"]).toBe(`Bearer ${KEY}`);
  });

  it("hides non-chat OpenAI models", async () => {
    const { fetchImpl } = fakeFetch(200, {
      data: [
        { id: "gpt-6-luna" },
        { id: "text-embedding-3-small" },
        { id: "tts-1" },
        { id: "whisper-1" },
        { id: "dall-e-3" },
        { id: "gpt-image-2" },
        { id: "omni-moderation-latest" },
        { id: "gpt-4o-mini-transcribe" },
        { id: "gpt-realtime" }
      ]
    });
    expect(await client({ provider: "openai" }, fetchImpl).listModels()).toEqual(["gpt-6-luna"]);
  });
});
