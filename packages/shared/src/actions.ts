// --- What a twin can DO: a real-life action catalogue + free "mime" actions, under rules ---

/** Body animations the renderer knows how to play. */
export const BODY_ANIMS = [
  "idle", "talk", "jump", "wave", "dance", "sit", "sleep", "clap", "point", "cheer", "stretch",
  "laugh", "cry", "think", "wash", "eat", "drink", "read", "phone", "sweep", "water", "exercise",
  "hug", "kiss", "highfive", "handshake"
] as const;
export type BodyAnim = (typeof BODY_ANIMS)[number];

export type ActionKind = "self" | "social" | "chore";

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
}

const a = (
  id: string, label: string, emoji: string, kind: ActionKind, anim: BodyAnim, seconds: number,
  opts: { target?: boolean; consentMin?: number | null; place?: string | null; aliases?: string[] } = {}
): ActionDef => ({
  id, label, emoji, kind, anim, seconds,
  target: opts.target ?? false,
  consentMin: opts.consentMin ?? null,
  place: opts.place ?? null,
  aliases: opts.aliases
});

export const ACTIONS: ActionDef[] = [
  // ---- body & feelings ----
  a("jump", "jump", "🦘", "self", "jump", 4, { aliases: ["hop"] }),
  a("wave", "wave", "👋", "self", "wave", 4, { aliases: ["greet"] }),
  a("dance", "dance", "💃", "self", "dance", 8),
  a("sit", "sit down", "🪑", "self", "sit", 20, { aliases: ["sit", "take a seat"] }),
  a("sleep", "take a nap", "😴", "self", "sleep", 25, { aliases: ["nap", "sleep", "rest"] }),
  a("clap", "clap", "👏", "self", "clap", 4, { aliases: ["applaud"] }),
  a("point", "point", "👉", "self", "point", 4),
  a("cheer", "cheer", "🙌", "self", "cheer", 5, { aliases: ["celebrate"] }),
  a("stretch", "stretch", "🙆", "self", "stretch", 6),
  a("laugh", "laugh", "😂", "self", "laugh", 5),
  a("cry", "cry", "😢", "self", "cry", 6, { aliases: ["sob"] }),
  a("think", "think", "🤔", "self", "think", 6, { aliases: ["ponder"] }),
  a("exercise", "exercise", "🏋️", "self", "exercise", 10, { aliases: ["work out", "do push ups", "train"], place: "event_space" }),
  // ---- daily life ----
  a("wash_hands", "wash hands", "🧼", "self", "wash", 6, { aliases: ["wash your hands"], place: "maker_space" }),
  a("eat", "eat something", "🍽️", "self", "eat", 12, { aliases: ["eat", "have lunch", "have dinner", "have breakfast"], place: "maker_space" }),
  a("drink_coffee", "drink coffee", "☕", "self", "drink", 12, { aliases: ["coffee", "drink", "have a coffee", "drink tea"], place: "maker_space" }),
  a("read", "read a book", "📖", "self", "read", 15, { aliases: ["read"], place: "network_hub" }),
  a("phone_call", "make a phone call", "📱", "self", "phone", 10, { aliases: ["call", "phone"] }),
  a("sweep", "sweep the floor", "🧹", "chore", "sweep", 10, { aliases: ["sweep", "clean"] }),
  a("water_plants", "water the plants", "🪴", "chore", "water", 10, { aliases: ["water", "garden"], place: "event_space" }),
  a("sing", "sing", "🎤", "self", "cheer", 8, { aliases: ["perform"], place: "plaza" }),
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
  return action.consentMin === null || feeling >= action.consentMin;
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
    return {
      ok: true,
      action: {
        id: def.id, label: def.label, emoji: def.emoji, anim: def.anim, seconds: def.seconds,
        place: def.place, targetName: def.target ? targetName : null
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
