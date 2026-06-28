import { eq } from "drizzle-orm";
import type { Project, ProjectType, ProjectStatus, ProjectRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { projects } from "./schema.js";

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: DB) {}

  async getById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      type: r.type as ProjectType,
      zone: r.zone,
      participantTwinIds: r.participantTwinIds,
      stepsTotal: r.stepsTotal,
      stepsDone: r.stepsDone,
      status: r.status as ProjectStatus
    };
  }

  async save(project: Project): Promise<void> {
    const row = {
      id: project.id,
      type: project.type,
      zone: project.zone,
      participantTwinIds: project.participantTwinIds,
      stepsTotal: project.stepsTotal,
      stepsDone: project.stepsDone,
      status: project.status
    };
    await this.db.insert(projects).values(row).onConflictDoUpdate({ target: projects.id, set: row });
  }
}
