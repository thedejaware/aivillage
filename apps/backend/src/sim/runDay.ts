import { randomUUID } from "node:crypto";
import {
  toWorldState, DEFAULT_ZONES, DAILY_ENERGY,
  type WorldState, type Twin, type Project, type Memory, type Structure, type ProjectType, type LlmClient
} from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleStructureRepository } from "../db/structureRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { spendBeat } from "../economy/energy.js";
import { planBeat } from "../agent/planner.js";
import { applyBeat, type BeatApplyDeps } from "./applyBeat.js";

const TYPE_BY_ZONE: Record<string, ProjectType> = {
  plaza: "fountain", maker_space: "workshop", event_space: "stage", network_hub: "garden"
};

const deps = (zone: string): BeatApplyDeps => ({
  newProjectId: () => randomUUID(),
  newStructureId: () => randomUUID(),
  newMemoryId: () => randomUUID(),
  now: () => new Date().toISOString(),
  chooseProjectType: () => TYPE_BY_ZONE[zone] ?? "fountain"
});

export interface DayResult {
  /** One WorldState snapshot per beat — the client plays these back over time. */
  frames: WorldState[];
  structuresBuilt: number;
}

interface WorkingTwin {
  twin: Twin;
  project: Project | null;
  recent: Memory[];
  pending: Awaited<ReturnType<typeof planBeat>> | null;
  acted: boolean;
}

/**
 * Run one simulated day, stepping every twin beat-by-beat (Claude calls within
 * a beat run in parallel), snapshotting the world after each beat, and persisting
 * the final state. Returns the per-beat frames for client-side playback.
 */
export async function runDay(llm: LlmClient): Promise<DayResult> {
  const db = getDb();
  const twinRepo = new DrizzleTwinRepository(db);
  const structRepo = new DrizzleStructureRepository(db);
  const memRepo = new DrizzleMemoryRepository(db);

  const loaded = await twinRepo.listAll();
  const work: WorkingTwin[] = loaded.map((t) => ({
    twin: { ...t, energy: DAILY_ENERGY, energyUpdatedAt: new Date().toISOString() },
    project: null,
    recent: [],
    pending: null,
    acted: false
  }));

  const existing = await structRepo.listAll();
  const allStructures: Structure[] = [...existing];
  const newStructures: Structure[] = [];
  const newMemories: Memory[] = [];
  const says: Record<string, string> = {};
  const frames: WorldState[] = [];

  for (let beat = 0; beat < DAILY_ENERGY; beat++) {
    // Plan every twin's beat in parallel (independent Claude calls).
    await Promise.all(
      work.map(async (w) => {
        w.acted = false;
        const spent = spendBeat(w.twin);
        if (!spent.ok) return;
        w.twin = spent.twin;
        w.acted = true;
        const ctx = {
          nearbyTwinNames: work.filter((o) => o.twin.id !== w.twin.id).map((o) => o.twin.name).slice(0, 3),
          recentMemories: [...w.recent].slice(-3).reverse(),
          activeProject: w.project
            ? { type: w.project.type, stepsDone: w.project.stepsDone, stepsTotal: w.project.stepsTotal }
            : null
        };
        w.pending = await planBeat(w.twin, ctx, llm);
      })
    );

    // Apply outcomes sequentially (pure, deterministic order).
    for (const w of work) {
      if (!w.acted || !w.pending) continue;
      const outcome = applyBeat(w.twin, w.project, w.pending, deps(w.twin.locationZone));
      w.twin = outcome.twin;
      w.project = outcome.project;
      w.recent.push(outcome.memory);
      newMemories.push(outcome.memory);
      says[w.twin.id] = outcome.narrative;
      if (outcome.structure) {
        newStructures.push(outcome.structure);
        allStructures.push(outcome.structure);
      }
    }

    frames.push(toWorldState({ zones: DEFAULT_ZONES, twins: work.map((w) => w.twin), structures: allStructures, saysByTwinId: says }));
  }

  // Persist final state.
  for (const w of work) await twinRepo.save(w.twin);
  for (const s of newStructures) await structRepo.save(s);
  for (const m of newMemories) await memRepo.append(m);

  return { frames, structuresBuilt: newStructures.length };
}
