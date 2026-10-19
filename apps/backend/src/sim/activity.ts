import {
  KITCHEN_DISHES, MAX_STAMINA, applyStamina, dishLookFor, isDrinkLook, isOrderActive, kitchenEnergyPhases, kitchenSteps, liveStamina,
  placeOf, settleEnergy, staminaDelta,
  type Dish, type EnergyPhase, type OwnerOrder, type PerformedAction, type Twin
} from "@aivillage/shared";

// --- Energy ("stamina") rules shared by owner orders, the next-step loop and runDay ---

/** What a tired twin says when the owner orders something tiring. Exact copy (O9). */
export const TIRED_REPLY = "I'm tired, let me rest first.";

/** What a twin does at a rest place. Tired twins always go home to sleep now (restPlaceFor). */
export const REST_ACTION: Record<string, string> = {
  home: "sleep"
};

/** Studying at the library costs energy (−1 / 60 s over 120 s), though the library's own effect is reading's +2. */
const STUDY_DELTA = -2;

/** Energy right now: it moves slowly toward the current activity's target once the twin is there. */
export const staminaOf = (t: Twin, now: Date = new Date()): number => liveStamina(t.stamina ?? MAX_STAMINA, t.order, now);

/** The twin with the energy gained so far written into `stamina` — call before replacing or clearing its order. */
export function settled(t: Twin, now: Date): Twin {
  const s = settleEnergy(t.stamina ?? MAX_STAMINA, t.order, now);
  if (s.stamina === (t.stamina ?? MAX_STAMINA) && s.order === (t.order ?? null)) return t; // nothing gained yet
  return { ...t, stamina: s.stamina, order: s.order };
}

/**
 * Energy change of doing `action` at `zone` (null action = just going there).
 * Sleeping (or simply going home) refills to MAX_STAMINA; an action without its
 * own place counts only as the place's main activity ("sit" on the lawn); social
 * and other anywhere-actions cost nothing.
 */
export function activityDelta(action: { id: string; place: string | null } | null, zone: string): number {
  if (action?.id === "sleep" || (!action && zone === "home")) return MAX_STAMINA;
  if (!action) return placeOf(zone)?.stamina ?? 0;
  if (action.id === "study") return STUDY_DELTA;
  if (action.place) return staminaDelta(action);
  // an anywhere-action counts only when it is the place's own activity ("sit" on the lawn)
  const place = placeOf(zone);
  return place && place.mainAction === action.id ? place.stamina : 0;
}

/** The energy an activity moves toward (stored as order.energyTo; reached slowly after arrival). */
export function staminaAfter(stamina: number, action: { id: string; place: string | null } | null, zone: string): number {
  return applyStamina(stamina, zone, activityDelta(action, zone));
}

/**
 * Does it cost energy (a tired twin refuses it and goes home to sleep)? Cooking
 * does: preparing and cooking come before the meal gives the energy back.
 */
export function isTiring(action: { id: string; place: string | null } | null, zone: string): boolean {
  return action?.id === "cook" || activityDelta(action, zone) < 0;
}

// --- The kitchen: what is cooked rides on the order ---

const pick = <T>(xs: T[], random: () => number): T => xs[Math.min(xs.length - 1, Math.floor(random() * xs.length))];

/** A dish from the menu, for a twin that cooks without being told what. */
export const randomDish = (random: () => number = Math.random): Dish => ({ ...pick(KITCHEN_DISHES, random) });

/** A dish someone named ("Cheese burger"): its name as said (cleaned), and the closest look. */
export function dishNamed(raw: string): Dish | null {
  const name = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
  if (!name) return null;
  return { name, look: KITCHEN_DISHES.find((d) => d.name === name)?.look ?? dishLookFor(name) };
}

/**
 * "cook": the dish rides on the action (a random one when none was named) and
 * the label names it ("cook pasta", "make juice"). Other actions pass through.
 */
export function withDish(action: PerformedAction, dish?: Dish | null, random: () => number = Math.random): PerformedAction {
  if (action.id !== "cook") return action;
  const d = dish ?? action.dish ?? randomDish(random);
  const seconds = kitchenSteps(d.look).reduce((sum, s) => sum + s.seconds, 0); // a drink is quicker than a meal
  return { ...action, dish: d, seconds, label: `${isDrinkLook(d.look) ? "make" : "cook"} ${d.name}` };
}

/**
 * The energy fields of a new order: the kitchen runs its own phases (down while
 * cooking, up while eating, no energyTo); everything else moves toward energyTo.
 */
export function orderEnergy(
  stamina: number, action: { id: string; place: string | null; dish?: Dish } | null, zone: string
): Pick<OwnerOrder, "energyTo"> & { energyPhases?: EnergyPhase[] } {
  if (action?.id === "cook") return { energyPhases: kitchenEnergyPhases(action.dish?.look ?? "plate") };
  return { energyTo: staminaAfter(stamina, action, zone) };
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
