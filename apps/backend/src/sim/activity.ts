import {
  MAX_STAMINA, applyStamina, isOrderActive, placeOf, staminaDelta,
  type Twin
} from "@aivillage/shared";

// --- Energy ("stamina") rules shared by owner orders, the next-step loop and runDay ---

/** What a tired twin says when the owner orders something tiring. Exact copy (O9). */
export const TIRED_REPLY = "I'm tired, let me rest first.";

/** What a twin does at each rest place. */
export const REST_ACTION: Record<string, string> = {
  home: "sleep",
  maker_space: "drink_coffee",
  network_hub: "read",
  event_space: "sit",
  pool: "sunbathe"
};

export const staminaOf = (t: Twin): number => t.stamina ?? MAX_STAMINA;

/**
 * Energy change of doing `action` at `zone` (null action = just going there).
 * Sleeping (or simply going home) refills to MAX_STAMINA; an action without its
 * own place counts only as the place's main activity ("sit" on the lawn); social
 * and other anywhere-actions cost nothing.
 */
export function activityDelta(action: { id: string; place: string | null } | null, zone: string): number {
  if (action?.id === "sleep" || (!action && zone === "home")) return MAX_STAMINA;
  if (!action) return placeOf(zone)?.stamina ?? 0;
  if (action.place) return staminaDelta(action);
  // an anywhere-action counts only when it is the place's own activity ("sit" on the lawn)
  const place = placeOf(zone);
  return place && place.mainAction === action.id ? place.stamina : 0;
}

/** Energy after the activity starts (costs and gains apply on start). */
export function staminaAfter(stamina: number, action: { id: string; place: string | null } | null, zone: string): number {
  return applyStamina(stamina, zone, activityDelta(action, zone));
}

export function isTiring(action: { id: string; place: string | null } | null, zone: string): boolean {
  return activityDelta(action, zone) < 0;
}

/** Riding, swimming, asleep…: can't be pulled into a conversation. */
export function isBusyNow(t: Twin, now: Date): boolean {
  return isOrderActive(t.order, now) && Boolean(placeOf(t.order!.zone)?.busy);
}

/** Doing something calm at a place (café, cinema, lawn…): conversations come to it. */
export function isSettledNow(t: Twin, now: Date): boolean {
  if (!isOrderActive(t.order, now)) return false;
  const place = placeOf(t.order!.zone);
  return Boolean(place && !place.busy);
}
