import type { Twin, Wallet, Project, Memory, Structure, Approval } from "./types.js";
import type { Relationship } from "./social.js";

/** Persistence boundary for twins. Implemented by the data layer (Drizzle). */
export interface TwinRepository {
  getById(id: string): Promise<Twin | null>;
  save(twin: Twin): Promise<void>;
  listAll(): Promise<Twin[]>;
}

/** Persistence boundary for placed structures (completed projects). */
export interface StructureRepository {
  save(structure: Structure): Promise<void>;
  listAll(): Promise<Structure[]>;
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

/** Persistence boundary for directed twin->twin relationships. */
export interface RelationshipRepository {
  get(fromTwinId: string, toTwinId: string): Promise<Relationship | null>;
  /** Apply a delta (creating the row at 0 first if missing); clamp score to [-100,100]; returns updated. */
  applyDelta(fromTwinId: string, toTwinId: string, delta: number): Promise<Relationship>;
  /** All relationships FROM this twin. */
  listFrom(twinId: string): Promise<Relationship[]>;
  /** Every relationship row (for popularity scoring). */
  listAll(): Promise<Relationship[]>;
}

/** Persistence boundary for owner approvals. */
export interface ApprovalRepository {
  create(a: { userId: string; twinId: string; kind: string; payload: Approval["payload"] }): Promise<Approval>;
  listPendingByUser(userId: string): Promise<Approval[]>;
  /** Set status approved/declined + resolvedAt. Returns updated row or null if missing/already resolved. */
  resolve(id: string, approved: boolean): Promise<Approval | null>;
  /** Newest APPROVED and not-yet-consumed approval for a twin, or null. */
  nextActionableForTwin(twinId: string): Promise<Approval | null>;
  hasPendingForTwin(twinId: string): Promise<boolean>;
  markConsumed(id: string): Promise<void>;
}
