import { randomUUID } from "node:crypto";
import type { Twin, Memory, Approval } from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import { users } from "../db/schema.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { DrizzleApprovalRepository } from "../db/approvalRepository.js";

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
}

/** Everything the owner's side panel needs: their twin, its recent life, pending decisions. */
export async function ownerPanel(userId: string): Promise<OwnerPanel> {
  if (!userId) return { twin: null, memories: [], approvals: [] };
  const db = getDb();
  const twins = await new DrizzleTwinRepository(db).listAll();
  const twin = twins.find((t) => t.ownerUserId === userId) ?? null;
  if (!twin) return { twin: null, memories: [], approvals: [] };
  const memories = await new DrizzleMemoryRepository(db).recent(twin.id, 8);
  const approvals = await new DrizzleApprovalRepository(db).listPendingByUser(userId);
  return { twin, memories, approvals };
}
