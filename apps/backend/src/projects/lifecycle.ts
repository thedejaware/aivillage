import type { Project, ProjectType } from "@aivillage/shared";

export function startProject(
  id: string, type: ProjectType, zone: string, participantTwinIds: string[], stepsTotal = 3
): Project {
  if (stepsTotal < 1) throw new Error("stepsTotal must be >= 1");
  return { id, type, zone, participantTwinIds, stepsTotal, stepsDone: 0, status: "active" };
}

export function advance(project: Project): Project {
  if (project.status === "complete") return project;
  const stepsDone = Math.min(project.stepsDone + 1, project.stepsTotal);
  const status = stepsDone >= project.stepsTotal ? "complete" : "active";
  return { ...project, stepsDone, status };
}

export function isComplete(project: Project): boolean {
  return project.status === "complete";
}
