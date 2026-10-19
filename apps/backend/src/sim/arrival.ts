import { MAX_STAMINA, isOrderActive, msToReach, type Twin } from "@aivillage/shared";

/**
 * A client saw the twin arrive for the order issued at `issuedAt`: energy starts
 * moving from now (see liveStamina). A twin sent home to rest stays asleep until
 * its energy is full; a twin at the kitchen stays until its meal is eaten. Returns null when there is nothing to record (an older
 * order, a second report, or an order that already ended).
 */
export function arrive(twin: Twin, issuedAt: string, now: Date): Twin | null {
  const o = twin.order;
  if (!o || o.issuedAt !== issuedAt || o.arrivedAt || !isOrderActive(o, now)) return null;
  const order = { ...o, arrivedAt: now.toISOString() };
  const base = twin.stamina ?? MAX_STAMINA;
  if (o.zone === "home" && o.energyTo !== null && o.energyTo !== undefined && o.energyTo > base) {
    const full = now.getTime() + msToReach(base, o.energyTo, "home");
    if (full > Date.parse(o.holdUntil)) order.holdUntil = new Date(full).toISOString();
  }
  // a meal always finishes: cooking, carrying and eating all run from arrival
  if (o.energyPhases && o.energyPhases.length > 0) {
    const done = now.getTime() + o.energyPhases.reduce((n, p) => n + p.ms, 0);
    if (done > Date.parse(o.holdUntil)) order.holdUntil = new Date(done).toISOString();
  }
  return { ...twin, order };
}
