import type { Twin, Project, BeatResult, Structure, Memory, ProjectType } from "@aivillage/shared";
import { advance, isComplete, startProject } from "../projects/lifecycle.js";
import { rewardFor, applyReward } from "../projects/reward.js";

export interface BeatApplyDeps {
  newProjectId: () => string;
  newStructureId: () => string;
  newMemoryId: () => string;
  now: () => string;
  /** Pick a project type when a twin starts a new one. */
  chooseProjectType: (twin: Twin) => ProjectType;
}

export interface BeatOutcome {
  twin: Twin;
  project: Project | null; // active project after the beat (null if none / just completed)
  structure: Structure | null; // placed iff a project completed this beat
  memory: Memory;
  narrative: string;
}

/** Pure: apply one planned beat to a twin (+ its active project) and report the effects. */
export function applyBeat(
  twin: Twin,
  activeProject: Project | null,
  beat: BeatResult,
  deps: BeatApplyDeps
): BeatOutcome {
  let nextTwin = twin;
  let project = activeProject;
  let structure: Structure | null = null;

  if (beat.verb === "move" && beat.target) {
    nextTwin = { ...nextTwin, locationZone: beat.target };
  } else if (beat.verb === "work") {
    if (!project) {
      project = startProject(deps.newProjectId(), deps.chooseProjectType(twin), twin.locationZone, [twin.id]);
    }
    project = advance(project);
    if (isComplete(project)) {
      structure = { id: deps.newStructureId(), projectId: project.id, type: project.type, zone: project.zone, builtByTwinId: twin.id };
      nextTwin = applyReward(nextTwin, rewardFor(project.type));
      project = null;
    }
  }
  // "socialize" currently just yields a memory/narrative; relationship effects land later.

  const memory: Memory = {
    id: deps.newMemoryId(),
    twinId: twin.id,
    kind: beat.verb,
    content: beat.narrative,
    importance: structure ? 2 : 1,
    createdAt: deps.now()
  };

  return { twin: nextTwin, project, structure, memory, narrative: beat.narrative };
}
