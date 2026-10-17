import { describe, it, expect } from "vitest";
import { PROVIDERS, getProvider, resolveBaseUrl, isChatModel, type AiSettings } from "../../../src/agent/providers/types.js";

const s = (over: Partial<AiSettings>): AiSettings => ({
  provider: "ollama",
  model: "llama3.2",
  apiKey: null,
  baseUrl: null,
  ...over
});

describe("PROVIDERS", () => {
  it("lists the five providers once each", () => {
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual(["anthropic", "gemini", "ollama", "openai", "openrouter"]);
  });

  it("only ollama works without a key", () => {
    expect(PROVIDERS.filter((p) => !p.needsKey).map((p) => p.id)).toEqual(["ollama"]);
  });

  it("every provider has a default model and base URL", () => {
    for (const p of PROVIDERS) {
      expect(p.defaultModel.length).toBeGreaterThan(0);
      expect(p.defaultBaseUrl).toMatch(/^https?:\/\//);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("getProvider finds by id", () => {
    expect(getProvider("gemini").defaultBaseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(getProvider("ollama").defaultBaseUrl).toBe("http://localhost:11434/v1");
  });
});

describe("resolveBaseUrl", () => {
  it("uses the provider default when baseUrl is null, without a trailing slash", () => {
    expect(resolveBaseUrl(s({ provider: "openrouter" }), {})).toBe("https://openrouter.ai/api/v1");
  });

  it("uses a custom baseUrl and trims trailing slashes", () => {
    expect(resolveBaseUrl(s({ provider: "openai", baseUrl: "https://proxy.example.com/v1//" }), {})).toBe(
      "https://proxy.example.com/v1"
    );
  });

  it("leaves ollama on localhost outside Docker", () => {
    expect(resolveBaseUrl(s({}), {})).toBe("http://localhost:11434/v1");
  });

  it("swaps localhost -> host.docker.internal for ollama in Docker", () => {
    const env = { AIV_IN_DOCKER: "1" };
    expect(resolveBaseUrl(s({}), env)).toBe("http://host.docker.internal:11434/v1");
    expect(resolveBaseUrl(s({ baseUrl: "http://127.0.0.1:11434/v1" }), env)).toBe(
      "http://host.docker.internal:11434/v1"
    );
  });

  it("does not swap a remote ollama host or other providers in Docker", () => {
    const env = { AIV_IN_DOCKER: "1" };
    expect(resolveBaseUrl(s({ baseUrl: "http://gpu-box:11434/v1" }), env)).toBe("http://gpu-box:11434/v1");
    expect(resolveBaseUrl(s({ provider: "openai", baseUrl: "http://localhost:8080/v1" }), env)).toBe(
      "http://localhost:8080/v1"
    );
  });
});

describe("suggested models (verified 2026-10-17)", () => {
  it("Anthropic comes first", () => {
    expect(PROVIDERS[0].id).toBe("anthropic");
  });

  it("every cloud provider suggests several models with prices, the default first and recommended", () => {
    for (const p of PROVIDERS.filter((x) => x.needsKey)) {
      expect(p.models.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.models[0].id, p.id).toBe(p.defaultModel);
      expect(p.models[0].recommended, p.id).toBe(true);
      for (const m of p.models) {
        expect(m.label.length).toBeGreaterThan(0);
        expect(m.price!.input).toBeGreaterThan(0);
        expect(m.price!.output).toBeGreaterThan(0);
      }
      expect(new Set(p.models.map((m) => m.id)).size, p.id).toBe(p.models.length);
    }
  });

  it("Haiku 5.5 is the Anthropic default", () => {
    expect(getProvider("anthropic").defaultModel).toBe("claude-haiku-5-5");
  });
});

describe("isChatModel", () => {
  it.each(["claude-haiku-5-5", "gpt-6-luna", "gemini-3.1-flash-lite", "anthropic/claude-sonnet-5.5", "llama3.2"])("%s is a chat model", (id) => {
    expect(isChatModel(id)).toBe(true);
  });
  it.each([
    "text-embedding-3-small", "gemini-embedding-001", "tts-1", "whisper-1", "dall-e-3", "gpt-image-1",
    "imagen-4.0-generate", "veo-3", "omni-moderation-latest", "gpt-4o-realtime-preview", "gpt-4o-transcribe",
    "google/gemini-3.1-flash-image", "anthropic/claude-haiku-5.5:batch", "babbage-002", "aqa"
  ])("%s is not", (id) => {
    expect(isChatModel(id)).toBe(false);
  });
});
