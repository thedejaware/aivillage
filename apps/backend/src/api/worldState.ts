import { toWorldState, DEFAULT_ZONES, type WorldState } from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleStructureRepository } from "../db/structureRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";

/** Build the render-ready WorldState from the database (twins, structures, last narration). */
export async function buildWorldState(): Promise<WorldState> {
  const db = getDb();
  const twins = await new DrizzleTwinRepository(db).listAll();
  const structures = await new DrizzleStructureRepository(db).listAll();
  const memRepo = new DrizzleMemoryRepository(db);

  const saysByTwinId: Record<string, string> = {};
  for (const t of twins) {
    const recent = await memRepo.recent(t.id, 1);
    if (recent.length > 0) saysByTwinId[t.id] = recent[0].content;
  }

  return toWorldState({ zones: DEFAULT_ZONES, twins, structures, saysByTwinId });
}
