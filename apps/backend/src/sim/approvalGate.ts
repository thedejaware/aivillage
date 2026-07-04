import type { Approval } from "@aivillage/shared";

export type GateDecision =
  | { action: "proceed"; consumeApprovalId: string | null }
  | { action: "wait" }
  | { action: "request" };

/**
 * Decide whether a twin may start a NEW project this beat.
 * NPCs always proceed. Owned twins: consume an approved grant if present;
 * wait quietly if a request is still pending; otherwise request approval.
 * (Only called when the twin has no active project and wants to work.)
 */
export function gateProjectStart(input: {
  ownerUserId: string | null;
  actionable: Approval | null;
  hasPending: boolean;
}): GateDecision {
  if (input.ownerUserId === null) return { action: "proceed", consumeApprovalId: null };
  if (input.actionable) return { action: "proceed", consumeApprovalId: input.actionable.id };
  if (input.hasPending) return { action: "wait" };
  return { action: "request" };
}
