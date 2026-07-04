import { randomUUID } from "node:crypto";
import { labelFor, type Twin, type Memory, type Approval } from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import { users } from "../db/schema.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { DrizzleApprovalRepository } from "../db/approvalRepository.js";
import { DrizzleRelationshipRepository } from "../db/relationshipRepository.js";
import { popularityScores } from "../sim/popularity.js";

export interface OnboardInput {
  name?: string;
  personality?: string;
  goal?: string;
}

export interface OnboardResult {
  userId: string;
  twinId: string;
}

/** Create a new user + their player-owned twin (auth-lite: anonymous guest user). */
export async function onboardTwin(input: OnboardInput): Promise<OnboardResult> {
  const name = (input.name ?? "").trim().slice(0, 20);
  if (!name) throw new Error("name is required");
  const personality = (input.personality ?? "").trim().slice(0, 120);
  const goal = (input.goal ?? "").trim().slice(0, 160);

  const db = getDb();
  const inserted = await db
    .insert(users)
    .values({ email: `${randomUUID()}@guest.aivillage.local` })
    .returning({ id: users.id });
  const userId = inserted[0].id;

  const twin: Twin = {
    id: randomUUID(),
    ownerUserId: userId,
    name,
    traits: personality ? [personality] : [],
    goals: goal ? [goal] : [],
    avatarSpriteUrl: null,
    skills: { building: 0, coding: 0, art: 0, social: 0 },
    reputation: 0,
    locationZone: "plaza",
    energy: 0,
    energyUpdatedAt: new Date(0).toISOString(),
    isNpc: false
  };
  await new DrizzleTwinRepository(db).save(twin);

  return { userId, twinId: twin.id };
}

export interface OwnerPanel {
  twin: Twin | null;
  memories: Memory[];
  approvals: Approval[];
  /** how MY twin feels about the others */
  relationships: { name: string; label: string; score: number }[];
  /** village standings by popularity (mean incoming feelings) */
  leaderboard: { twinId: string; name: string; popularity: number }[];
}

const EMPTY: OwnerPanel = { twin: null, memories: [], approvals: [], relationships: [], leaderboard: [] };

/** Everything the owner's side panel needs: their twin, its recent life, pending decisions, standings. */
export async function ownerPanel(userId: string): Promise<OwnerPanel> {
  if (!userId) return EMPTY;
  const db = getDb();
  const twins = await new DrizzleTwinRepository(db).listAll();
  const twin = twins.find((t) => t.ownerUserId === userId) ?? null;
  if (!twin) return EMPTY;

  const memories = await new DrizzleMemoryRepository(db).recent(twin.id, 8);
  const approvals = await new DrizzleApprovalRepository(db).listPendingByUser(userId);

  const relRepo = new DrizzleRelationshipRepository(db);
  const nameOf = new Map(twins.map((t) => [t.id, t.name] as const));
  const relationships = (await relRepo.listFrom(twin.id))
    .filter((r) => r.score !== 0 && nameOf.has(r.toTwinId))
    .sort((a, b) => b.score - a.score)
    .map((r) => ({ name: nameOf.get(r.toTwinId)!, label: labelFor(r.score), score: r.score }));

  const pop = popularityScores(await relRepo.listAll());
  const leaderboard = twins
    .map((t) => ({ twinId: t.id, name: t.name, popularity: pop.get(t.id) ?? 0 }))
    .sort((a, b) => b.popularity - a.popularity);

  return { twin, memories, approvals, relationships, leaderboard };
}
