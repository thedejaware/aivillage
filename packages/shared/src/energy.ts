// --- Energy over time: it changes only once the twin is there, one point at a time ---

import { MAX_STAMINA } from "./places.js";

/** Resting gives +1 energy every 4 s (25 → 100 takes 5 minutes). */
export const ENERGY_GAIN_MS = 4_000;
/** Tiring activities take −1 energy every 6 s. */
export const ENERGY_DRAIN_MS = 6_000;
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
}

const clamp = (n: number) => Math.max(0, Math.min(MAX_STAMINA, n));

/**
 * Energy right now. `stamina` is the energy when the order was given; it moves
 * toward `order.energyTo` one point at a time from arrival until the activity
 * ends (holdUntil) or the target is reached. Nothing changes during the walk.
 */
export function liveStamina(stamina: number, order: EnergyOrder | null | undefined, now: Date | number): number {
  const base = clamp(stamina);
  if (!order || order.energyTo === null || order.energyTo === undefined) return base;
  const t = typeof now === "number" ? now : now.getTime();
  const end = Date.parse(order.holdUntil);
  const start = order.arrivedAt
    ? Date.parse(order.arrivedAt)
    : t >= end ? Date.parse(order.issuedAt) + WALK_GUESS_MS : Infinity; // still walking
  const elapsed = Math.min(t, end) - start;
  if (!(elapsed > 0)) return base;
  const to = clamp(order.energyTo);
  const steps = Math.floor(elapsed / (to > base ? ENERGY_GAIN_MS : ENERGY_DRAIN_MS));
  return to > base ? Math.min(to, base + steps) : Math.max(to, base - steps);
}

/** How long moving from `from` to `to` takes (ms). */
export function msToReach(from: number, to: number): number {
  const d = clamp(to) - clamp(from);
  return Math.abs(d) * (d > 0 ? ENERGY_GAIN_MS : ENERGY_DRAIN_MS);
}

/** Energy is climbing right now (the twin arrived and isn't full yet). */
export function isCharging(stamina: number, order: EnergyOrder | null | undefined, now: Date | number): boolean {
  if (!order?.arrivedAt || order.energyTo === null || order.energyTo === undefined) return false;
  const t = typeof now === "number" ? now : now.getTime();
  if (t >= Date.parse(order.holdUntil) || t < Date.parse(order.arrivedAt)) return false;
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
  const live = liveStamina(base, order, now);
  if (!order || live === base) return { stamina: base, order: order ?? null };
  const start = order.arrivedAt ? Date.parse(order.arrivedAt) : Date.parse(order.issuedAt) + WALK_GUESS_MS;
  const spent = Math.abs(live - base) * (live > base ? ENERGY_GAIN_MS : ENERGY_DRAIN_MS);
  return { stamina: live, order: { ...order, arrivedAt: new Date(start + spent).toISOString() } };
}

/** What a client needs to draw the energy bar moving between server updates. */
export interface EnergyPlan extends EnergyOrder {
  /** energy when the activity was given (liveStamina's `stamina`) */
  base: number;
}

/** The plan for an active order that changes energy; null when energy stays put. */
export function energyPlanOf(stamina: number, order: EnergyOrder | null | undefined, now: Date | number): EnergyPlan | null {
  if (!order || order.energyTo === null || order.energyTo === undefined) return null;
  const t = typeof now === "number" ? now : now.getTime();
  if (Date.parse(order.holdUntil) <= t) return null;
  return { base: clamp(stamina), issuedAt: order.issuedAt, holdUntil: order.holdUntil, energyTo: order.energyTo, arrivedAt: order.arrivedAt ?? null };
}
