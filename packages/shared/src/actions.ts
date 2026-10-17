// --- What a twin can DO: a real-life action catalogue + free "mime" actions, under rules ---
import { placeOf } from "./places.js";

/** Body animations the renderer knows how to play. */
export const BODY_ANIMS = [
  "idle", "talk", "jump", "wave", "dance", "sit", "sleep", "clap", "point", "cheer", "stretch",
  "laugh", "cry", "think", "wash", "eat", "drink", "read", "phone", "sweep", "water", "exercise",
  "hug", "kiss", "highfive", "handshake",
  // Main Street places
  "swim", "bike", "run", "lift", "dig", "watch", "ride"
] as const;
export type BodyAnim = (typeof BODY_ANIMS)[number];

export type ActionKind = "self" | "social" | "chore";

/** Something the twin holds while doing it (the avatar draws it). */
export type ActionItem = "juice" | "plate" | "popcorn" | "basket" | "dumbbell";

export interface ActionDef {
  id: string;
  label: string;
  emoji: string;
  kind: ActionKind;
  /** needs another twin to do it with */
  target: boolean;
  /** minimum feeling (target → actor, −100..100) for the target to agree; null = no consent needed */
  consentMin: number | null;
  /** the venue where it naturally happens (the twin walks there first); null = anywhere */
  place: string | null;
  anim: BodyAnim;
  /** how long one performance lasts */
  seconds: number;
  /** extra names people use for it */
  aliases?: string[];
  /** something held while doing it */
  item?: ActionItem;
}

const a = (
  id: string, label: string, emoji: string, kind: ActionKind, anim: BodyAnim, seconds: number,
  opts: { target?: boolean; consentMin?: number | null; place?: string | null; aliases?: string[]; item?: ActionItem } = {}
): ActionDef => ({
  id, label, emoji, kind, anim, seconds,
  target: opts.target ?? false,
  consentMin: opts.consentMin ?? null,
  place: opts.place ?? null,
  aliases: opts.aliases,
  ...(opts.item ? { item: opts.item } : {})
});

export const ACTIONS: ActionDef[] = [
  // ---- body & feelings ----
  a("jump", "jump", "🦘", "self", "jump", 4, { aliases: ["hop"] }),
  a("wave", "wave", "👋", "self", "wave", 4, { aliases: ["greet"] }),
  a("dance", "dance", "💃", "self", "dance", 8),
  a("sit", "sit down", "🪑", "self", "sit", 20, { aliases: ["sit", "take a seat"] }),
  a("sleep", "sleep at home", "😴", "self", "sleep", 150, { aliases: ["nap", "sleep", "take a nap", "go to sleep", "go to bed", "go home", "rest at home"], place: "home" }),
  a("clap", "clap", "👏", "self", "clap", 4, { aliases: ["applaud"] }),
  a("point", "point", "👉", "self", "point", 4),
  a("cheer", "cheer", "🙌", "self", "cheer", 5, { aliases: ["celebrate"] }),
  a("stretch", "stretch", "🙆", "self", "stretch", 6),
  a("laugh", "laugh", "😂", "self", "laugh", 5),
  a("cry", "cry", "😢", "self", "cry", 6, { aliases: ["sob"] }),
  a("think", "think", "🤔", "self", "think", 6, { aliases: ["ponder"] }),
  a("exercise", "exercise", "🤸", "self", "exercise", 10, { aliases: ["do push ups", "stretch out"], place: "event_space" }),
  // ---- daily life ----
  a("wash_hands", "wash hands", "🧼", "self", "wash", 6, { aliases: ["wash your hands"], place: "maker_space" }),
  a("eat", "eat something", "🍽️", "self", "eat", 60, { aliases: ["eat", "have lunch", "have dinner", "have breakfast", "eat at the cafe", "eat at the café"], place: "maker_space", item: "plate" }),
  a("drink_coffee", "drink coffee", "☕", "self", "drink", 60, { aliases: ["coffee", "drink", "have a coffee", "drink tea"], place: "maker_space" }),
  a("drink_juice", "drink fresh juice", "🧃", "self", "drink", 40, { aliases: ["juice", "make juice", "drink juice", "have a juice"], place: "maker_space", item: "juice" }),
  a("read", "read a book", "📖", "self", "read", 90, { aliases: ["read", "relax", "rest", "sit quietly"], place: "network_hub" }),
  a("phone_call", "make a phone call", "📱", "self", "phone", 10, { aliases: ["call", "phone"] }),
  a("sweep", "sweep the floor", "🧹", "chore", "sweep", 10, { aliases: ["sweep", "clean"] }),
  a("water_plants", "water the plants", "🪴", "chore", "water", 10, { aliases: ["water", "garden"], place: "event_space" }),
  a("sing", "sing", "🎤", "self", "cheer", 8, { aliases: ["perform"], place: "plaza" }),
  // ---- Main Street places ----
  a("swim", "swim", "🏊", "self", "swim", 90, { aliases: ["go swimming", "swimming", "go to the pool", "have a swim"], place: "pool" }),
  a("sunbathe", "sunbathe by the pool", "😎", "self", "sit", 70, { aliases: ["sunbathe", "lie in the sun", "relax by the pool"], place: "pool" }),
  a("work_out", "work out", "🏋️", "self", "lift", 80, { aliases: ["work out", "workout", "lift weights", "go to the gym", "train", "gym"], place: "gym", item: "dumbbell" }),
  a("run", "run on the treadmill", "🏃", "self", "run", 70, { aliases: ["run", "jog", "go running", "treadmill"], place: "gym" }),
  a("ride_bike", "ride a bike", "🚲", "self", "bike", 80, { aliases: ["ride a bike", "bike", "cycle", "go cycling", "bike ride", "ride bikes"], place: "bike_rack" }),
  a("watch_movie", "watch a movie", "🎬", "self", "watch", 150, { aliases: ["watch a movie", "watch a film", "movie", "go to the cinema", "cinema", "see a movie"], place: "cinema", item: "popcorn" }),
  a("ride_coaster", "ride the rollercoaster", "🎢", "self", "ride", 60, { aliases: ["ride the rollercoaster", "rollercoaster", "roller coaster", "ride the roller coaster", "coaster", "go to the funfair", "lunapark"], place: "funfair" }),
  a("garden", "work in the garden", "🥕", "chore", "dig", 80, { aliases: ["pick vegetables", "garden", "gardening", "plant vegetables", "grow vegetables", "harvest"], place: "garden", item: "basket" }),
  // ---- with someone ----
  a("hug", "hug", "🤗", "social", "hug", 5, { target: true, consentMin: 0, aliases: ["cuddle", "embrace"] }),
  a("kiss_cheek", "kiss on the cheek", "😘", "social", "kiss", 4, { target: true, consentMin: 30, aliases: ["kiss", "kiss cheek", "cheek kiss"] }),
  a("high_five", "high-five", "🙏", "social", "highfive", 3, { target: true, consentMin: -10, aliases: ["high five", "highfive"] }),
  a("handshake", "shake hands", "🤝", "social", "handshake", 3, { target: true, consentMin: -30, aliases: ["shake hands"] }),
  a("dance_together", "dance together", "🕺", "social", "dance", 8, { target: true, consentMin: 10 }),
  a("chat", "have a chat", "💬", "social", "talk", 8, { target: true, consentMin: null, aliases: ["talk", "talk to"] })
];

const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

export function findAction(name: string): ActionDef | undefined {
  const n = norm(name);
  return (
    ACTIONS.find((x) => norm(x.id) === n || norm(x.label) === n) ??
    ACTIONS.find((x) => (x.aliases ?? []).some((al) => norm(al) === n))
  );
}

// ---- rules ----

const BLOCKED: { re: RegExp; reason: string }[] = [
  { re: /\b(kill|murder|punch|hit|kick|slap|stab|shoot|hurt|attack|fight|beat up|strangle|choke)\b/, reason: "no violence in the village" },
  { re: /\b(sex|naked|nude|undress|take off (his|her|their|my|your)? ?clothes|strip|grope|make out)\b/, reason: "that's not something twins do here" },
  { re: /\bkiss(es|ing)?( on)?( the| his| her| their)? (lips|mouth)\b|\bfrench kiss\b/, reason: "kisses are on the cheek only" },
  { re: /\b(fly|flying|teleport|vanish|disappear|leave the village|leave the island|go to (the )?moon)\b/, reason: "twins can't do that in this world" }
];

export function checkSafety(text: string): { ok: true } | { ok: false; reason: string } {
  const t = text.toLowerCase();
  for (const b of BLOCKED) if (b.re.test(t)) return { ok: false, reason: b.reason };
  return { ok: true };
}

/** Does the other twin agree? `feeling` = how the TARGET feels about the actor. */
export function consentGiven(action: ActionDef, feeling: number): boolean {
  // a place activity done together ("take Sena to the cinema") is an invitation
  const min = action.consentMin ?? (!action.target && placeOf(action.place) ? INVITE_CONSENT_MIN : null);
  return min === null || feeling >= min;
}

/** An action as it will be performed (catalogue entry or mime). */
export interface PerformedAction {
  id: string; // catalogue id or "mime"
  label: string;
  emoji: string;
  anim: BodyAnim;
  seconds: number;
  place: string | null;
  targetName: string | null;
  /** the target refused (touch without consent) */
  refused?: boolean;
  /** something held while doing it */
  item?: ActionItem;
}

/** For mimes: pick the closest body animation by keyword. */
const MIME_ANIMS: [RegExp, BodyAnim][] = [
  [/guitar|piano|drum|violin|music|play/, "dance"],
  [/cook|bake|paint|draw|write|knit|build|fix|repair/, "wash"],
  [/yoga|run|jog|swim|push/, "exercise"],
  [/photo|selfie|look|watch|search/, "point"],
  [/meditat|pray|wait|relax/, "sit"],
  [/sing|shout|celebrat/, "cheer"]
];

/** Energy effect of doing this action (its place's effect; juice +10; anywhere-actions 0). */
export function staminaDelta(action: { id: string; place: string | null }): number {
  if (action.id === "drink_juice" || action.id === "sunbathe") return 10;
  if (action.id === "sleep") return 0; // the house refills instead (applyStamina)
  return placeOf(action.place)?.stamina ?? 0;
}

/** How long an action order holds the twin: the activity plus time to walk there. */
export function actHoldMs(action: { seconds: number }): number {
  return (action.seconds + 40) * 1000;
}

/** Someone invited along to a place ("take Sena to the cinema") agrees from this feeling up. */
export const INVITE_CONSENT_MIN = -10;

export function resolveAction(input: {
  action: string;
  target?: string | null;
  label?: string | null;
  emoji?: string | null;
}): { ok: true; action: PerformedAction } | { ok: false; reason: string } {
  const text = `${input.action} ${input.label ?? ""}`;
  const safety = checkSafety(text);
  if (!safety.ok) return safety;

  const def = findAction(input.action);
  const targetName = input.target?.trim() || null;
  if (def) {
    if (def.target && !targetName) return { ok: false, reason: `who should I ${def.label} with?` };
    // place activities can be shared: "take Sena to the cinema"
    const keepPartner = def.target || (def.place !== null && placeOf(def.place) !== undefined);
    return {
      ok: true,
      action: {
        id: def.id, label: def.label, emoji: def.emoji, anim: def.anim, seconds: def.seconds,
        place: def.place, targetName: keepPartner ? targetName : null,
        ...(def.item ? { item: def.item } : {})
      }
    };
  }
  const label = (input.label?.trim() || input.action.trim()).slice(0, 40);
  if (!label) return { ok: false, reason: "I'm not sure what to do" };
  const anim = MIME_ANIMS.find(([re]) => re.test(label.toLowerCase()))?.[1] ?? "think";
  return {
    ok: true,
    action: { id: "mime", label, emoji: input.emoji?.trim() || "✨", anim, seconds: 8, place: null, targetName: null }
  };
}
