import type { PerformedAction } from "./actions.js";

// --- Owner orders: the owner tells their twin what to do, and it DOES it ---

/** A command extracted from an owner's chat message (by Claude tool use or the rule parser). */
export type TwinCommand =
  | { type: "go"; zone: string }
  /** message = something to pass on ("tell Mom dinner is ready") */
  | { type: "talk_to"; targetName: string; message?: string }
  | { type: "stay" }
  | { type: "free" }
  /** do an action from the catalogue (or a mime); target = partner for social actions */
  | { type: "act"; action: string; target: string | null; label?: string; emoji?: string };

export type OrderKind = "go" | "talk_to" | "stay" | "act";

/**
 * The twin's current owner order. While it is active the autonomous world
 * clock leaves the twin alone and other twins come to it instead of dragging it away.
 */
export interface OwnerOrder {
  kind: OrderKind;
  /** where the twin should be (for talk_to: where the target was when ordered) */
  zone: string;
  targetName: string | null;
  /** short human status, e.g. "Heading to THE CAFÉ" */
  label: string;
  issuedAt: string; // ISO
  holdUntil: string; // ISO
  /** kind "act": what to perform once there */
  action?: PerformedAction | null;
  /** kind "talk_to": a message to pass on */
  message?: string | null;
  /** chosen by the twin's own AI (not an order from the player) */
  auto?: boolean;
  /** energy this activity moves toward, one point at a time after arrival (see energy.ts) */
  energyTo?: number | null;
  /** when a client saw the twin arrive (ISO); energy starts changing then */
  arrivedAt?: string | null;
}

/** How long an owner order overrides the twin's autonomous life. */
export const ORDER_HOLD_MS = 10 * 60 * 1000;
/** An action order holds the twin only for the walk + the performance. */
export const ACT_HOLD_MS = 90 * 1000;

export function isOrderActive(order: OwnerOrder | null | undefined, now: Date): boolean {
  if (!order) return false;
  return Date.parse(order.holdUntil) > now.getTime();
}
