import type { LlmClient } from "@aivillage/shared";

/**
 * Deterministic LlmClient for local runs and tests — cycles through canned
 * beat-JSON responses. Lets the simulation run with zero API cost / no key.
 */
export class CannedLlmClient implements LlmClient {
  private i = 0;

  constructor(private readonly responses: string[]) {
    if (responses.length === 0) throw new Error("CannedLlmClient needs at least one response");
  }

  async generate(): Promise<string> {
    const out = this.responses[this.i % this.responses.length];
    this.i++;
    return out;
  }
}
