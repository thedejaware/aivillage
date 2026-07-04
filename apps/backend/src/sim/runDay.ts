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

  const zoneByName = new Map(DEFAULT_ZONES.map((z) => [z.name, z] as const));
  const positions: Record<string, { col: number; row: number }> = {};
  for (const w of work) {
    const z = zoneByName.get(w.twin.locationZone) ?? DEFAULT_ZONES[0];
    positions[w.twin.id] = { col: z.col, row: z.row };
  }
  // Where a twin walks while doing a "work" beat — a little patrol around its zone.
  // Indexed per-twin (hash offset) so twins move in DIFFERENT directions each beat.
  const WORK_PATROL = [
    { dc: 0, dr: 0 }, { dc: 1.6, dr: -0.5 }, { dc: 0.5, dr: 1.6 }, { dc: -1.6, dr: 0.5 }, { dc: -0.5, dr: -1.6 }
  ];
  const hashId = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  const patrolFor = (twinId: string, beat: number) => WORK_PATROL[(beat + hashId(twinId)) % WORK_PATROL.length];

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

      // Walk the twin somewhere meaningful for this beat.
      const z = zoneByName.get(w.twin.locationZone) ?? DEFAULT_ZONES[0];
      const verb = w.pending.verb;
      const tgt = w.pending.target;
      if (verb === "move" && tgt && zoneByName.has(tgt)) {
        const zz = zoneByName.get(tgt)!;
        positions[w.twin.id] = { col: zz.col, row: zz.row };
      } else if (verb === "socialize" && tgt) {
        const other = work.find((o) => o.twin.id !== w.twin.id && o.twin.name === tgt);
        const op = other ? positions[other.twin.id] : null;
        const off = patrolFor(w.twin.id, beat);
        positions[w.twin.id] = op ? { col: op.col - 1, row: op.row } : { col: z.col + off.dc, row: z.row + off.dr };
      } else {
        const off = patrolFor(w.twin.id, beat);
        positions[w.twin.id] = { col: z.col + off.dc, row: z.row + off.dr };
      }
    }

    frames.push(toWorldState({
      zones: DEFAULT_ZONES,
      twins: work.map((w) => w.twin),
      structures: allStructures,
      saysByTwinId: says,
      positionsByTwinId: { ...positions }
    }));
  }

  // Persist final state.
  for (const w of work) await twinRepo.save(w.twin);
  for (const s of newStructures) await structRepo.save(s);
  for (const m of newMemories) await memRepo.append(m);

  return { frames, structuresBuilt: newStructures.length };
}
