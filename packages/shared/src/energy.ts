// --- Energy over time: it changes only once the twin is there, one point at a time ---

import { MAX_STAMINA } from "./places.js";

/** Sleeping at home gives +1 energy every 4 s (25 → 100 takes 5 minutes). */
export const ENERGY_GAIN_MS = 4_000;
/** Resting anywhere else (a coffee, a book, the lawn…) gives only +1 every 15 s. */
export const ENERGY_REST_MS = 15_000;
/** Tiring activities take −1 energy every 6 s. */
export const ENERGY_DRAIN_MS = 6_000;
/** The library: reading gives +1 every 35 s, studying takes −1 every 60 s. */
export const ENERGY_LIBRARY_READ_MS = 35_000;
export const ENERGY_STUDY_MS = 60_000;
/** The kitchen: preparing and cooking take −1 every 10 s, eating gives +1 every 5 s. */
export const ENERGY_COOK_MS = 10_000;
export const ENERGY_EAT_MS = 5_000;
/** When an ended activity has no reported arrival, assume the walk took this long. */
export const WALK_GUESS_MS = 30_000;

/** The order fields energy needs (OwnerOrder has them all). */
export interface EnergyOrder {
  issuedAt: string;
  holdUntil: string;
  /** energy the activity moves toward (absent = it doesn't change energy) */
  energyTo?: number | null;
  /** when a client saw the twin arrive (ISO) */
  arrivedAt?: string | null;
  /** where the activity is: only the house ("home") rests fast */
  zone?: string;
  /** steps with their own rate, run back to back from arrival (the kitchen: cook, carry, eat); wins over energyTo */
  energyPhases?: EnergyPhase[] | null;
}

/** One step of an activity: `ms` long, one point every `everyMs`, up (1), down (−1) or neither (0). */
export interface EnergyPhase {
  ms: number;
  everyMs: number;
  dir: 1 | -1 | 0;
}

/** Time for one point of energy: sleeping is fast, other rest slow, tiring things in between. */
function stepMs(gaining: boolean, zone: string | undefined): number {
  if (zone === "library") return gaining ? ENERGY_LIBRARY_READ_MS : ENERGY_STUDY_MS;
  if (!gaining) return ENERGY_DRAIN_MS;
  return zone === "home" ? ENERGY_GAIN_MS : ENERGY_REST_MS;
}

const hasPhases = (o: EnergyOrder | null | undefined): o is EnergyOrder & { energyPhases: EnergyPhase[] } =>
  Boolean(o?.energyPhases && o.energyPhases.length > 0);

/**
 * Run the phases for `elapsed` ms from `base`: the energy reached, the time
 * that whole points (and finished phases) used up, and the phases left.
 */
function runPhases(base: number, phases: EnergyPhase[], elapsed: number): { value: number; used: number; left: EnergyPhase[] } {
  let value = base;
  let used = 0;
  let e = elapsed;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    if (e >= ph.ms) {
      if (ph.dir !== 0) value = clamp(value + ph.dir * Math.floor(ph.ms / ph.everyMs));
      used += ph.ms;
      e -= ph.ms;
      continue;
    }
    const spent = ph.dir === 0 ? e : Math.floor(e / ph.everyMs) * ph.everyMs;
    if (ph.dir !== 0) value = clamp(value + ph.dir * Math.floor(e / ph.everyMs));
    used += spent;
    return { value, used, left: [{ ...ph, ms: ph.ms - spent }, ...phases.slice(i + 1)] };
  }
  return { value, used, left: [] };
}

/** When energy starts moving (arrival, or a walk guess once the activity is over); Infinity while walking. */
function startOf(order: EnergyOrder, t: number): number {
  if (order.arrivedAt) return Date.parse(order.arrivedAt);
  return t >= Date.parse(order.holdUntil) ? Date.parse(order.issuedAt) + WALK_GUESS_MS : Infinity;
}

const clamp = (n: number) => Math.max(0, Math.min(MAX_STAMINA, n));

/**
 * Energy right now. `stamina` is the energy when the order was given; it moves
 * toward `order.energyTo` one point at a time from arrival until the activity
 * ends (holdUntil) or the target is reached. Nothing changes during the walk.
 */
export function liveStamina(stamina: number, order: EnergyOrder | null | undefined, now: Date | number): number {
  const base = clamp(stamina);
  if (!order) return base;
  const t = typeof now === "number" ? now : now.getTime();
  const elapsed = Math.min(t, Date.parse(order.holdUntil)) - startOf(order, t);
  if (hasPhases(order)) return elapsed > 0 ? runPhases(base, order.energyPhases, elapsed).value : base;
  if (order.energyTo === null || order.energyTo === undefined) return base;
  if (!(elapsed > 0)) return base;
  const to = clamp(order.energyTo);
  const steps = Math.floor(elapsed / stepMs(to > base, order.zone));
  return to > base ? Math.min(to, base + steps) : Math.max(to, base - steps);
}

/** How long moving from `from` to `to` at `zone` takes (ms). */
export function msToReach(from: number, to: number, zone?: string): number {
  const d = clamp(to) - clamp(from);
  return Math.abs(d) * stepMs(d > 0, zone);
}

/** Energy is climbing right now (the twin arrived and isn't full yet). */
export function isCharging(stamina: number, order: EnergyOrder | null | undefined, now: Date | number): boolean {
  if (!order?.arrivedAt) return false;
  const t = typeof now === "number" ? now : now.getTime();
  if (t >= Date.parse(order.holdUntil) || t < Date.parse(order.arrivedAt)) return false;
  if (hasPhases(order)) {
    const { value, left } = runPhases(clamp(stamina), order.energyPhases, t - Date.parse(order.arrivedAt));
    return left.length > 0 && left[0].dir === 1 && value < MAX_STAMINA;
  }
  if (order.energyTo === null || order.energyTo === undefined) return false;
  return liveStamina(stamina, order, t) < clamp(order.energyTo);
}

/**
 * Fold the energy gained (or spent) so far into the stored value, and move the
 * order's arrival forward by exactly the time those whole points took. Safe to
 * call any number of times: later energy stays the same, no part-step is lost.
 * Call it before replacing or clearing an order, so progress isn't dropped.
 */
export function settleEnergy<O extends EnergyOrder>(
  stamina: number, order: O | null | undefined, now: Date | number
): { stamina: number; order: O | null } {
  const base = clamp(stamina);
  if (order && hasPhases(order)) {
    const t = typeof now === "number" ? now : now.getTime();
    const start = startOf(order, t);
    const elapsed = Math.min(t, Date.parse(order.holdUntil)) - start;
    if (!(elapsed > 0)) return { stamina: base, order };
    const run = runPhases(base, order.energyPhases, elapsed);
    return { stamina: run.value, order: { ...order, energyPhases: run.left, arrivedAt: new Date(start + run.used).toISOString() } };
  }
  const live = liveStamina(base, order, now);
  if (!order || live === base) return { stamina: base, order: order ?? null };
  const start = order.arrivedAt ? Date.parse(order.arrivedAt) : Date.parse(order.issuedAt) + WALK_GUESS_MS;
  const spent = Math.abs(live - base) * stepMs(live > base, order.zone);
  return { stamina: live, order: { ...order, arrivedAt: new Date(start + spent).toISOString() } };
}

/** What a client needs to draw the energy bar moving between server updates. */
export interface EnergyPlan extends EnergyOrder {
  /** energy when the activity was given (liveStamina's `stamina`) */
  base: number;
}

/** The plan for an active order that changes energy; null when energy stays put. */
export function energyPlanOf(stamina: number, order: EnergyOrder | null | undefined, now: Date | number): EnergyPlan | null {
  if (!order || (!hasPhases(order) && (order.energyTo === null || order.energyTo === undefined))) return null;
  const t = typeof now === "number" ? now : now.getTime();
  if (Date.parse(order.holdUntil) <= t) return null;
  return {
    base: clamp(stamina), issuedAt: order.issuedAt, holdUntil: order.holdUntil, energyTo: order.energyTo ?? null,
    arrivedAt: order.arrivedAt ?? null, zone: order.zone, ...(hasPhases(order) ? { energyPhases: order.energyPhases } : {})
  };
}
