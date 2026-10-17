import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import {
  MAX_TWINS, validateAppearance, DAILY_ENERGY, MAX_STAMINA, LAYOUT_VERSION, DEFAULT_ZONES,
  type Appearance, type Twin, type TwinRole, type TwinSummary, type VillageInfo
} from "@aivillage/shared";
import type { DB } from "../db/client.js";
import { users, twins, memories, relationships, chatMessages, approvals, structures } from "../db/schema.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleSettingsRepository } from "../db/settingsRepository.js";
import { clearQueuedSteps } from "../sim/stepQueue.js";

/**
 * The local village: one owner (no login — it's one person's app), up to
 * MAX_TWINS living twins, exactly one active main twin.
 */

const LOCAL_OWNER_EMAIL = "owner@local.aivillage";
const NAME_MAX = 40;

export class VillageError extends Error {
  constructor(readonly code: "invalid" | "limit" | "not_found", message: string) {
    super(message);
  }
}

export async function ensureLocalOwner(db: DB): Promise<string> {
  const found = await db.select({ id: users.id }).from(users).where(eq(users.email, LOCAL_OWNER_EMAIL)).limit(1);
  if (found[0]) return found[0].id;
  const [row] = await db.insert(users).values({ email: LOCAL_OWNER_EMAIL }).onConflictDoNothing().returning({ id: users.id });
  if (row) return row.id;
  return (await db.select({ id: users.id }).from(users).where(eq(users.email, LOCAL_OWNER_EMAIL)).limit(1))[0].id;
}

const summary = (t: Twin): TwinSummary => ({
  id: t.id,
  name: t.name,
  role: t.role ?? "villager",
  active: t.active ?? true,
  appearance: validateAppearance(t.appearance),
  traits: t.traits,
  goals: t.goals
});

export async function villageInfo(db: DB): Promise<VillageInfo> {
  const ownerId = await ensureLocalOwner(db);
  const all = await new DrizzleTwinRepository(db).listEverything();
  const main = all.find((t) => t.role === "main" && t.active);
  return {
    ownerId,
    mainTwinId: main?.id ?? null,
    aiConfigured: (await new DrizzleSettingsRepository(db).get()) !== null,
    twins: all.map(summary),
    livingCount: all.filter((t) => t.active).length,
    maxTwins: MAX_TWINS
  };
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, NAME_MAX) : "";
  if (!name) throw new VillageError("invalid", "a twin needs a name");
  return name;
}

const cleanList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 5) : undefined;

async function assertRoom(db: DB): Promise<void> {
  const living = (await new DrizzleTwinRepository(db).listAll()).length;
  if (living >= MAX_TWINS) throw new VillageError("limit", `the village is full (${MAX_TWINS} twins) — deactivate or delete one first`);
}

export interface NewTwin {
  name: string;
  appearance: Appearance;
  role: TwinRole;
  personality?: string;
  goal?: string;
  /** where it starts (default: the stage) */
  zone?: string;
}

export async function createTwin(db: DB, input: NewTwin): Promise<Twin> {
  const name = cleanName(input.name);
  const repo = new DrizzleTwinRepository(db);
  const ownerId = await ensureLocalOwner(db);
  const isMain = input.role === "main";
  // only one main twin is active; a new one waits until you switch to it
  const active = isMain ? !(await repo.listAll()).some((t) => t.role === "main") : true;
  if (active) await assertRoom(db);

  const twin: Twin = {
    id: randomUUID(),
    ownerUserId: isMain ? ownerId : null,
    name,
    traits: input.personality?.trim() ? [input.personality.trim()] : [],
    goals: input.goal?.trim() ? [input.goal.trim()] : [],
    avatarSpriteUrl: null,
    skills: { building: 0, coding: 0, art: 0, social: 0 },
    reputation: 0,
    locationZone: input.zone ?? "plaza",
    energy: DAILY_ENERGY,
    energyUpdatedAt: new Date().toISOString(),
    isNpc: !isMain,
    order: null,
    appearance: validateAppearance(input.appearance),
    role: isMain ? "main" : "villager",
    active,
    pose: null,
    stamina: MAX_STAMINA
  };
  await repo.save(twin);
  return twin;
}

export interface TwinPatch {
  name?: string;
  appearance?: Appearance;
  traits?: string[];
  goals?: string[];
}

async function mustGet(db: DB, id: string): Promise<Twin> {
  const t = await new DrizzleTwinRepository(db).getById(id);
  if (!t) throw new VillageError("not_found", "no such twin");
  return t;
}

export async function updateTwin(db: DB, id: string, patch: TwinPatch): Promise<Twin> {
  const t = await mustGet(db, id);
  const updated: Twin = {
    ...t,
    ...(patch.name !== undefined ? { name: cleanName(patch.name) } : {}),
    ...(patch.appearance !== undefined ? { appearance: validateAppearance(patch.appearance) } : {}),
    ...(cleanList(patch.traits) ? { traits: cleanList(patch.traits)! } : {}),
    ...(cleanList(patch.goals) ? { goals: cleanList(patch.goals)! } : {})
  };
  await new DrizzleTwinRepository(db).save(updated);
  return updated;
}

/** Hide the twin from the village; everything about it is kept. */
export async function deactivateTwin(db: DB, id: string): Promise<Twin> {
  const t = await mustGet(db, id);
  const updated: Twin = { ...t, active: false, order: null };
  await new DrizzleTwinRepository(db).save(updated);
  clearQueuedSteps(id);
  return updated;
}

/** Bring a twin back exactly as it was. A main twin takes over from the current main. */
export async function activateTwin(db: DB, id: string): Promise<Twin> {
  const repo = new DrizzleTwinRepository(db);
  const t = await mustGet(db, id);
  if (t.active) return t;
  if (t.role === "main") {
    for (const other of await repo.listAll()) {
      if (other.role === "main") {
        await repo.save({ ...other, active: false, order: null });
        clearQueuedSteps(other.id);
      }
    }
  }
  await assertRoom(db);
  const updated: Twin = { ...t, active: true };
  await repo.save(updated);
  return updated;
}

/** Remove the twin and everything about it: memories, feelings, chat, approvals. */
export async function deleteTwin(db: DB, id: string): Promise<void> {
  await mustGet(db, id);
  await db.transaction(async (tx) => {
    await tx.delete(memories).where(eq(memories.twinId, id));
    await tx.delete(relationships).where(or(eq(relationships.fromTwinId, id), eq(relationships.toTwinId, id)));
    await tx.delete(chatMessages).where(eq(chatMessages.twinId, id));
    await tx.delete(approvals).where(eq(approvals.twinId, id));
    await tx.update(structures).set({ builtByTwinId: null }).where(eq(structures.builtByTwinId, id));
    await tx.delete(twins).where(and(eq(twins.id, id)));
  });
  clearQueuedSteps(id);
}

/**
 * The browser saves where everyone is, so the village resumes exactly there. Unknown ids are ignored.
 * Only the pose (and venue) columns are written, so energy and orders changed meanwhile survive.
 * A venue name the map doesn't know keeps the twin's current venue.
 */
export async function savePoses(db: DB, poses: { id: string; x: number; z: number; yaw: number; zone: string }[]): Promise<void> {
  const repo = new DrizzleTwinRepository(db);
  const byId = new Map((await repo.listAll()).map((t) => [t.id, t]));
  const known = new Set(DEFAULT_ZONES.map((z) => z.name));
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  for (const p of poses) {
    const t = byId.get(p.id);
    if (!t || !finite(p.x) || !finite(p.z) || !finite(p.yaw) || typeof p.zone !== "string") continue;
    const zone = known.has(p.zone) ? p.zone : t.locationZone;
    await db
      .update(twins)
      .set({ pose: { x: p.x, z: p.z, yaw: p.yaw, zone, layout: LAYOUT_VERSION }, locationZone: zone })
      .where(eq(twins.id, t.id));
  }
}
