// --- Owner orders: the owner tells their twin what to do, and it DOES it ---

/** A command extracted from an owner's chat message (by Claude tool use or the rule parser). */
export type TwinCommand =
  | { type: "go"; zone: string }
  | { type: "talk_to"; targetName: string }
  | { type: "stay" }
  | { type: "free" };

export type OrderKind = "go" | "talk_to" | "stay";

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
}

/** How long an owner order overrides the twin's autonomous life. */
export const ORDER_HOLD_MS = 10 * 60 * 1000;

export function isOrderActive(order: OwnerOrder | null | undefined, now: Date): boolean {
  if (!order) return false;
  return Date.parse(order.holdUntil) > now.getTime();
}
