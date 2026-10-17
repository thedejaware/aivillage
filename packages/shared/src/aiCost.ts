import { MAX_TWINS, type Chattiness } from "./types.js";

// --- How often the village asks the player's AI, and roughly what that costs ---

/** World-clock pace per chattiness: a tick every `tickMs`, `actors` twins act per tick. */
export const CHATTINESS_PACE: Record<Chattiness, { tickMs: number; actors: number }> = {
  calm: { tickMs: 120_000, actors: 1 },
  normal: { tickMs: 60_000, actors: 2 },
  busy: { tickMs: 30_000, actors: 2 }
};

/** Planning AI calls allowed per minute (a twin asks when its to-do list runs out). */
export const NEXT_STEP_CAP: Record<Chattiness, number> = { calm: 3, normal: 6, busy: 10 };
/** One planning call writes a to-do list of this many activities ("to-do list" mode). */
export const PLAN_STEPS = 3;
/** A twin finishes about this many activities per hour (≈ 2 min activity + walking). */
const ACTIVITIES_PER_TWIN_HOUR = 24;

/** Average AI calls per acting twin (a plan, plus a conversation about half the time). */
const CALLS_PER_BEAT = 1.5;
/** Rough size of one village AI call. */
const TOKENS_IN = 2000;
const TOKENS_OUT = 200;

/** A model's list price, in dollars per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
}

/** AI calls per hour while the village is open (owner chat not included): drama ticks + next-step turns. */
export function callsPerHour(chattiness: Chattiness, twins: number = MAX_TWINS): number {
  const pace = CHATTINESS_PACE[chattiness];
  const drama = (3_600_000 / pace.tickMs) * pace.actors * CALLS_PER_BEAT;
  const nextSteps = Math.min(NEXT_STEP_CAP[chattiness] * 60, (twins * ACTIVITIES_PER_TWIN_HOUR) / PLAN_STEPS);
  return Math.round(drama + nextSteps);
}

/** Estimated dollars per hour while the village is open. */
export function hourlyCost(chattiness: Chattiness, price: ModelPrice, twins: number = MAX_TWINS): number {
  const perCall = (TOKENS_IN * price.input + TOKENS_OUT * price.output) / 1_000_000;
  return callsPerHour(chattiness, twins) * perCall;
}

export function formatHourlyCost(dollars: number): string {
  if (dollars < 0.005) return "< $0.01 / hour";
  return `≈ $${dollars.toFixed(2)} / hour`;
}
