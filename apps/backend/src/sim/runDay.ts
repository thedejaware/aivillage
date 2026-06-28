import { randomUUID } from "node:crypto";
import { DAILY_ENERGY, type Twin, type ProjectType, type LlmClient } from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleStructureRepository } from "../db/structureRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { runTwinBeats, type RunDeps } from "./runTwinBeats.js";

const TYPE_BY_ZONE: Record<string, ProjectType> = {
  plaza: "fountain",
  maker_space: "workshop",
  event_space: "stage",
  network_hub: "garden"
};

export interface DaySummary {
  twinsRun: number;
  structuresBuilt: number;
}

export interface RunDayOptions {
  /** Called after each twin's results are persisted — e.g. to broadcast live progress. */
  onProgress?: () => Promise<void> | void;
}

/**
 * Run one simulated day for every twin in the DB and persist the results.
 * Each call grants a fresh day of energy so the world keeps moving on demand.
 */
export async function runDay(llm: LlmClient, opts: RunDayOptions = {}): Promise<DaySummary> {
  const db = getDb();
  const twinRepo = new DrizzleTwinRepository(db);
  const structRepo = new DrizzleStructureRepository(db);
  const memRepo = new DrizzleMemoryRepository(db);

  const twins = await twinRepo.listAll();
  let structuresBuilt = 0;

  for (const loaded of twins) {
    const twin: Twin = { ...loaded, energy: DAILY_ENERGY, energyUpdatedAt: new Date().toISOString() };
    const deps: RunDeps = {
      newProjectId: () => randomUUID(),
      newStructureId: () => randomUUID(),
      newMemoryId: () => randomUUID(),
      now: () => new Date().toISOString(),
      chooseProjectType: (t) => TYPE_BY_ZONE[t.locationZone] ?? "fountain",
      contextFor: () => ({
        nearbyTwinNames: twins.filter((x) => x.id !== loaded.id).map((x) => x.name).slice(0, 3),
        recentMemories: []
      })
    };

    const res = await runTwinBeats(twin, null, llm, deps);
    await twinRepo.save(res.twin);
    for (const s of res.structuresBuilt) {
      await structRepo.save(s);
      structuresBuilt++;
    }
    for (const m of res.memories) {
      await memRepo.append(m);
    }
    if (opts.onProgress) await opts.onProgress();
  }

  return { twinsRun: twins.length, structuresBuilt };
}
