import type { Structure, StructureRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { structures } from "./schema.js";

export class DrizzleStructureRepository implements StructureRepository {
  constructor(private readonly db: DB) {}

  /** Persist a placed structure. The in-memory id/projectId are not reused; the DB assigns the id. */
  async save(structure: Structure): Promise<void> {
    await this.db.insert(structures).values({
      type: structure.type,
      zone: structure.zone,
      builtByTwinId: structure.builtByTwinId ?? null,
      projectId: null
    });
  }

  /** Ordered by creation so tile placement is stable across reads. */
  async listAll(): Promise<Structure[]> {
    const rows = await this.db.select().from(structures).orderBy(structures.createdAt);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId ?? "",
      type: r.type as Structure["type"],
      zone: r.zone,
      builtByTwinId: r.builtByTwinId
    }));
  }
}
