import type { Twin, Project, LlmClient, Memory, Structure } from "@aivillage/shared";
import { spendBeat } from "../economy/energy.js";
import { planBeat, type PlanContext } from "../agent/planner.js";
import { applyBeat, type BeatApplyDeps } from "./applyBeat.js";

export interface RunDeps extends BeatApplyDeps {
  contextFor: (twin: Twin) => PlanContext;
}

export interface TwinDayResult {
  twin: Twin;
  activeProject: Project | null;
  structuresBuilt: Structure[];
  memories: Memory[];
  narratives: string[];
}

/**
 * Run one twin through its available beats: spend energy, plan a beat (LLM),
 * apply its effects, accumulate the day's outcomes. Stops when energy runs out.
 */
export async function runTwinBeats(
  twin: Twin,
  activeProject: Project | null,
  llm: LlmClient,
  deps: RunDeps
): Promise<TwinDayResult> {
  let current = twin;
  let project = activeProject;
  const structuresBuilt: Structure[] = [];
  const memories: Memory[] = [];
  const narratives: string[] = [];

  while (current.energy > 0) {
    const spend = spendBeat(current);
    if (!spend.ok) break;
    current = spend.twin;

    const base = deps.contextFor(current);
    const ctx: PlanContext = {
      nearbyTwinNames: base.nearbyTwinNames,
      // What this twin just did today, newest first — stops it looping the same beat.
      recentMemories: memories.length ? [...memories].slice(-3).reverse() : base.recentMemories,
      activeProject: project
        ? { type: project.type, stepsDone: project.stepsDone, stepsTotal: project.stepsTotal }
        : null
    };
    const beat = await planBeat(current, ctx, llm);
    const outcome = applyBeat(current, project, beat, deps);

    current = outcome.twin;
    project = outcome.project;
    if (outcome.structure) structuresBuilt.push(outcome.structure);
    memories.push(outcome.memory);
    narratives.push(outcome.narrative);
  }

  return { twin: current, activeProject: project, structuresBuilt, memories, narratives };
}
