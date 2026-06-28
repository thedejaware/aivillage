import { eq, desc } from "drizzle-orm";
import type { Memory, MemoryRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { memories } from "./schema.js";

export class DrizzleMemoryRepository implements MemoryRepository {
  constructor(private readonly db: DB) {}

  async append(memory: Memory): Promise<void> {
    await this.db.insert(memories).values({
      twinId: memory.twinId,
      kind: memory.kind,
      content: memory.content,
      importance: memory.importance
    });
  }

  async recent(twinId: string, limit: number): Promise<Memory[]> {
    const rows = await this.db
      .select().from(memories)
      .where(eq(memories.twinId, twinId))
      .orderBy(desc(memories.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      twinId: r.twinId,
      kind: r.kind,
      content: r.content,
      importance: r.importance,
      createdAt: r.createdAt.toISOString()
    }));
  }
}
