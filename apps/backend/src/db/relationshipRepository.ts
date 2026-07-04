import { and, eq } from "drizzle-orm";
import type { Relationship, RelationshipRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { relationships } from "./schema.js";

type RelRow = typeof relationships.$inferSelect;

function clamp(n: number): number {
  return Math.max(-100, Math.min(100, Math.round(n)));
}

function toRelationship(r: RelRow): Relationship {
  return {
    fromTwinId: r.fromTwinId,
    toTwinId: r.toTwinId,
    score: r.score,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class DrizzleRelationshipRepository implements RelationshipRepository {
  constructor(private readonly db: DB) {}

  async get(fromTwinId: string, toTwinId: string): Promise<Relationship | null> {
    const rows = await this.db
      .select()
      .from(relationships)
      .where(and(eq(relationships.fromTwinId, fromTwinId), eq(relationships.toTwinId, toTwinId)))
      .limit(1);
    return rows[0] ? toRelationship(rows[0]) : null;
  }

  async applyDelta(fromTwinId: string, toTwinId: string, delta: number): Promise<Relationship> {
    const existing = await this.db
      .select()
      .from(relationships)
      .where(and(eq(relationships.fromTwinId, fromTwinId), eq(relationships.toTwinId, toTwinId)))
      .limit(1);

    if (!existing[0]) {
      // create row; score = clamp(delta)
      const rows = await this.db
        .insert(relationships)
        .values({
          fromTwinId,
          toTwinId,
          score: clamp(delta),
          updatedAt: new Date(),
        })
        .returning();
      return toRelationship(rows[0]!);
    } else {
      const newScore = clamp(existing[0].score + delta);
      const rows = await this.db
        .update(relationships)
        .set({ score: newScore, updatedAt: new Date() })
        .where(and(eq(relationships.fromTwinId, fromTwinId), eq(relationships.toTwinId, toTwinId)))
        .returning();
      return toRelationship(rows[0]!);
    }
  }

  async listFrom(twinId: string): Promise<Relationship[]> {
    const rows = await this.db
      .select()
      .from(relationships)
      .where(eq(relationships.fromTwinId, twinId));
    return rows.map(toRelationship);
  }

  async listAll(): Promise<Relationship[]> {
    const rows = await this.db.select().from(relationships);
    return rows.map(toRelationship);
  }
}
