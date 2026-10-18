// --- The village's places (Main Street): what each one does to a twin's energy, how many fit ---

export type PlaceId =
  | "home" | "network_hub" | "maker_space" | "garden" | "plaza" | "gym"
  | "pool" | "event_space" | "cinema" | "funfair" | "bike_rack";

export interface PlaceDef {
  zone: PlaceId;
  label: string;
  emoji: string;
  /** energy change when an activity here starts (the house refills to MAX_STAMINA) */
  stamina: number;
  /** how many twins can do the activity at once */
  capacity: number;
  /** a place to get energy back */
  restful: boolean;
  /** twins here are busy (riding, swimming, asleep…) and can't be pulled into a conversation */
  busy: boolean;
  /** the catalogue action a twin does here by default */
  mainAction: string;
}

/** Energy ("stamina" in code) runs 0–100. */
export const MAX_STAMINA = 100;
/** Below this a twin is tired: it refuses tiring things and goes to rest. */
export const TIRED_BELOW = 20;
/** Below this a tired twin goes home to sleep. */
export const EXHAUSTED_BELOW = 10;

const p = (
  zone: PlaceId, label: string, emoji: string, stamina: number, capacity: number,
  mainAction: string, opts: { busy?: boolean } = {}
): PlaceDef => ({ zone, label, emoji, stamina, capacity, restful: stamina > 0 || zone === "home", busy: opts.busy ?? false, mainAction });

export const PLACES: PlaceDef[] = [
  p("home", "the house", "🏠", 0, 10, "sleep", { busy: true }),
  p("network_hub", "the quiet corner", "🌳", 20, 2, "read"),
  p("maker_space", "the café", "☕", 15, 8, "drink_coffee"),
  p("garden", "the hobby garden", "🥕", -10, 3, "garden"),
  p("plaza", "the stage", "🎤", -10, 1, "sing"),
  p("gym", "the gym", "🏋️", -25, 5, "work_out", { busy: true }),
  p("pool", "the pool", "🏊", -25, 12, "swim", { busy: true }),
  p("event_space", "the lawn", "🌸", 10, 4, "sit"),
  p("cinema", "the cinema", "🎬", -5, 10, "watch_movie"),
  p("funfair", "the rollercoaster", "🎢", -15, 4, "ride_coaster", { busy: true }),
  p("bike_rack", "the bikes", "🚲", -15, 4, "ride_bike", { busy: true })
];

export function placeOf(zone: string | null | undefined): PlaceDef | undefined {
  return zone ? PLACES.find((x) => x.zone === zone) : undefined;
}

/** Energy after doing something at `zone` (delta defaults to the place's effect). The house refills it. */
export function applyStamina(stamina: number, zone: string | null, delta?: number): number {
  if (zone === "home" && delta === undefined) return MAX_STAMINA;
  const d = delta ?? placeOf(zone)?.stamina ?? 0;
  return Math.max(0, Math.min(MAX_STAMINA, Math.round(stamina + d)));
}

export function isTired(stamina: number): boolean {
  return stamina < TIRED_BELOW;
}

/** Where a tired twin goes: home to sleep when exhausted, else the café or the quiet corner. */
export function restPlaceFor(stamina: number, random: () => number = Math.random): PlaceId {
  if (stamina < EXHAUSTED_BELOW) return "home";
  return random() < 0.5 ? "maker_space" : "network_hub";
}
