import type { NextStep } from "../agent/nextStepPlanner.js";

/**
 * "To-do list" mode: each twin's remaining planned activities. One AI call
 * plans PLAN_STEPS activities; the twin works through them without new calls.
 * In-memory on purpose — losing it on restart only costs one new AI call.
 */
const queues = new Map<string, NextStep[]>();

export function queuedSteps(twinId: string): NextStep[] {
  return [...(queues.get(twinId) ?? [])];
}

export function setQueuedSteps(twinId: string, steps: NextStep[]): void {
  if (steps.length > 0) queues.set(twinId, [...steps]);
  else queues.delete(twinId);
}

/** Forget a twin's plan (owner order, deactivated, deleted); no id = forget everyone's. */
export function clearQueuedSteps(twinId?: string): void {
  if (twinId === undefined) queues.clear();
  else queues.delete(twinId);
}

export function queuedTwinIds(): string[] {
  return [...queues.keys()];
}
