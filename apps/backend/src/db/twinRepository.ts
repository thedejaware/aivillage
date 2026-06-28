import { eq } from "drizzle-orm";
import type { Twin, TwinRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { twins } from "./schema.js";

export class DrizzleTwinRepository implements TwinRepository {
  constructor(private readonly db: DB) {}

  async getById(id: string): Promise<Twin | null> {
    const rows = await this.db.select().from(twins).where(eq(twins.id, id)).limit(1);
    const r = rows[0];
    if (!r) return null;
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
      isNpc: r.isNpc
    };
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
      isNpc: twin.isNpc
    };
    await this.db.insert(twins).values(row).onConflictDoUpdate({ target: twins.id, set: row });
  }
}
