import type { Twin, Wallet, Project, Memory } from "./types.js";

/** Persistence boundary for twins. Implemented by the data layer (Drizzle). */
export interface TwinRepository {
  getById(id: string): Promise<Twin | null>;
  save(twin: Twin): Promise<void>;
}

/** Persistence boundary for the credit wallet + ledger. */
export interface WalletRepository {
  getByUserId(userId: string): Promise<Wallet | null>;
  /** Atomically apply a delta and append a ledger row. Returns the new wallet. */
  applyDelta(userId: string, delta: number, reason: string): Promise<Wallet>;
}

/** The model boundary. Unit tests inject a fake; production wraps Claude. */
export interface LlmClient {
  /** Return the model's raw text completion for a prompt. */
  generate(prompt: string): Promise<string>;
}

export interface ProjectRepository {
  getById(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
}

export interface MemoryRepository {
  append(memory: Memory): Promise<void>;
  recent(twinId: string, limit: number): Promise<Memory[]>;
}
