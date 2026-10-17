import { asc, eq } from "drizzle-orm";
import type { Twin, TwinRepository, TwinRole } from "@aivillage/shared";
import type { DB } from "./client.js";
import { twins } from "./schema.js";

type Row = typeof twins.$inferSelect;

function toTwin(r: Row): Twin {
  return {
    id: r.id,
    ownerUserId: r.ownerUserId,
    name: r.name,
    traits: r.traits,
    goals: r.goals,
    avatarSpriteUrl: r.avatarSpriteUrl,
    skills: r.skills,
    reputation: r.reputation,
    locationZone: r.locationZone,
    energy: r.energy,
    energyUpdatedAt: r.energyUpdatedAt.toISOString(),
    isNpc: r.isNpc,
    order: r.ownerOrder ?? null,
    ...(r.appearance ? { appearance: r.appearance } : {}),
    role: (r.role === "main" ? "main" : "villager") as TwinRole,
    active: r.active,
    pose: r.pose ?? null
  };
}

export class DrizzleTwinRepository implements TwinRepository {
  constructor(private readonly db: DB) {}

  async getById(id: string): Promise<Twin | null> {
    const rows = await this.db.select().from(twins).where(eq(twins.id, id)).limit(1);
    return rows[0] ? toTwin(rows[0]) : null;
  }

  async save(twin: Twin): Promise<void> {
    const row = {
      id: twin.id,
      ownerUserId: twin.ownerUserId,
      name: twin.name,
      traits: twin.traits,
      goals: twin.goals,
      avatarSpriteUrl: twin.avatarSpriteUrl,
      skills: twin.skills,
      reputation: twin.reputation,
      locationZone: twin.locationZone,
      energy: twin.energy,
      energyUpdatedAt: new Date(twin.energyUpdatedAt),
      isNpc: twin.isNpc,
      ownerOrder: twin.order ?? null,
      appearance: twin.appearance ?? null,
      role: twin.role ?? "villager",
      active: twin.active ?? true,
      pose: twin.pose ?? null
    };
    await this.db.insert(twins).values(row).onConflictDoUpdate({ target: twins.id, set: row });
  }

  /** Twins living in the village right now (deactivated twins are left out). */
  async listAll(): Promise<Twin[]> {
    const rows = await this.db.select().from(twins).where(eq(twins.active, true)).orderBy(asc(twins.createdAt));
    return rows.map(toTwin);
  }

  /** Every twin, including deactivated ones (Settings page). */
  async listEverything(): Promise<Twin[]> {
    const rows = await this.db.select().from(twins).orderBy(asc(twins.createdAt));
    return rows.map(toTwin);
  }
}
