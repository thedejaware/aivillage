import {
  DEFAULT_ZONES, ZONE_DISPLAY, ORDER_HOLD_MS, ACTIONS, findAction, resolveAction, consentGiven, actHoldMs,
  isTired, placeOf, restPlaceFor
} from "@aivillage/shared";
import type { Twin, TwinCommand, OwnerOrder, PerformedAction } from "@aivillage/shared";
import { REST_ACTION, TIRED_REPLY, isTiring, staminaAfter, staminaOf } from "../sim/activity.js";

/**
 * Owner → twin commands. Claude's tool use is the primary way we learn what the
 * owner wants; this rule parser is the safety net for when the model forgets to
 * call a tool (or when we run on the canned offline brain).
 */

/**
 * Resolve a user/LLM-provided place name to a canonical zone id.
 * Accepts zone ids ("event_space"), display names ("THE LAWN"), or loose
 * fragments ("lawn", "cafe", "café", "kafe", "stage", "quiet").
 */
export function normalizeZone(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^the\s+/, "");
  if (!s) return null;
  for (const z of DEFAULT_ZONES) {
    if (z.name === s || z.name.replace(/_/g, " ") === s) return z.name;
    const display = (ZONE_DISPLAY[z.name] ?? "").toLowerCase().replace(/^the\s+/, "");
    if (display === s) return z.name;
  }
  // loose matching for chat language ("lawn", "cafe", "kafe"…)
  const fuzzy: Record<string, string> = {
    lawn: "event_space", picnic: "event_space",
    cafe: "maker_space", "café": "maker_space", kafe: "maker_space", coffee: "maker_space",
    stage: "plaza", sahne: "plaza", plaza: "plaza",
    quiet: "network_hub", corner: "network_hub", bench: "network_hub",
    gym: "gym", pool: "pool", cinema: "cinema", movie: "cinema", film: "cinema", garden: "garden",
    home: "home", house: "home", coaster: "funfair", funfair: "funfair", lunapark: "funfair",
    bike: "bike_rack", bicycle: "bike_rack"
  };
  for (const [k, v] of Object.entries(fuzzy)) if (s.includes(k)) return v;
  return null;
}

const zoneName = (zone: string) => ZONE_DISPLAY[zone] ?? zone;

const FREE_RE = /\b(do whatever you (want|like)|you'?re free|go live your life|live your (own )?life|back to normal|do your (own )?thing|serbestsin)\b/;
const STAY_RE = /\b(stay (here|there|put|where you are)|wait (here|there)|don'?t move|stop|burada kal)\b/;
const TALK_RE = /\b(?:talk|speak|chat)\s+(?:to|with)\s+(.+)|\bsay\s+(?:hi|hello)\s+to\s+(.+)/;
const GO_RE = /\b(?:go|walk|head|run|move|get|come)\s+(?:over\s+|back\s+)?(?:to|into|towards?)\s+(.+)/;
const TR_TALK_RE = /(.+?)\s+ile\s+konu[şs]/;
const TR_GO_RE = /\b(git|gidin|yürü)\b/;
/** The owner describing their OWN plans ("I want to go to the café") is not a command. */
const SELF_SUBJECT_RE = /\b(i|we|i'm|im|i'll|i'd|we're|we'll|they|he|she)\b/;
const POLITE_ASK_RE = /\b(can|could|would|will) you\b|\bplease\b/;

function matchVillager(rest: string, villagers: string[]): string | null {
  const r = rest.trim().toLowerCase();
  const byLength = [...villagers].sort((a, b) => b.length - a.length);
  for (const v of byLength) {
    const n = v.toLowerCase();
    if (r === n || r.startsWith(`${n} `) || r.startsWith(`${n},`) || r.startsWith(`${n}!`) || r.startsWith(`${n}?`) || r.startsWith(`${n}.`)) return v;
  }
  return null;
}

/** Text in front of the verb names someone else as the subject → not an order to the twin. */
function aboutSomeoneElse(clause: string, verbIndex: number): boolean {
  const before = clause.slice(0, verbIndex);
  return SELF_SUBJECT_RE.test(before) && !POLITE_ASK_RE.test(before);
}

const POLITE_PREFIX_RE = /^((please|now|ok|okay|hey|go and|can you|could you|would you|will you)\s+)+/;
const TELL_RE = /^tell\s+(.+)/;
const GIVE_RE = /^give\s+(.+?)\s+an?\s+(hug|kiss|high[ -]?five|handshake)\b/;

/**
 * Every way people name an action, longest first ("high five" before "high").
 * A phrase two actions share ("garden") goes to the one findAction picks (id/label first).
 */
const ACTION_PHRASES: { phrase: string; id: string }[] = ACTIONS
  .filter((a) => a.id !== "chat") // talking is talk_to
  .flatMap((a) => [a.id.replace(/_/g, " "), a.label, ...(a.aliases ?? [])].map((phrase) => ({ phrase: phrase.toLowerCase(), id: findAction(phrase)?.id ?? a.id })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** "run to the lawn" is a walk, not the treadmill. */
const WALK_ON_RE = /^(to|into|towards?|over|back|across)\b/;

/** An action you can bring someone along to: a social action, or a place activity ("take Sena to the cinema"). */
const takesPartner = (id: string) => {
  const def = findAction(id);
  return Boolean(def && (def.target || placeOf(def.place)));
};

/** The action at the start of `text` ("watch a movie tonight" → watch_movie). */
function actionAtStart(text: string): string | null {
  for (const { phrase, id } of ACTION_PHRASES) if (text === phrase || text.startsWith(`${phrase} `)) return id;
  return null;
}

const TAKE_RE = /^take\s+(.+)/;

/** "take Sena to the cinema", "take Aiko swimming", "take Ravi to watch a movie". */
function parseTake(c: string, villagers: string[]): TwinCommand | null {
  const take = TAKE_RE.exec(c);
  if (!take) return null;
  const name = matchVillager(take[1], villagers);
  if (!name) return null;
  const rest = take[1].slice(name.length).trim().replace(/^(along\s+)?(with you\s+)?/, "");
  const noTo = rest.replace(/^(to|for)\s+/, "");
  const id = actionAtStart(rest) ?? actionAtStart(noTo);
  if (id && placeOf(findAction(id)?.place)) return { type: "act", action: id, target: name };
  const zone = normalizeZone(noTo);
  const main = zone ? placeOf(zone)?.mainAction : undefined;
  return main ? { type: "act", action: main, target: name } : null;
}

/** "jump", "please wave", "hug Ravi", "give Aiko a hug", "tell Ravi dinner is ready". */
function parseAction(clause: string, villagers: string[]): TwinCommand | null {
  const c = clause.replace(POLITE_PREFIX_RE, "").trim();
  const tell = TELL_RE.exec(c);
  if (tell) {
    const name = matchVillager(tell[1], villagers);
    if (name) {
      const message = tell[1].slice(name.length).replace(/^\s*(that\s+)?/, "").trim();
      if (message) return { type: "talk_to", targetName: name, message };
    }
  }
  const give = GIVE_RE.exec(c);
  if (give) {
    const name = matchVillager(give[1], villagers);
    const id = findAction(give[2])?.id;
    if (name && id) return { type: "act", action: id, target: name };
  }
  const take = parseTake(c, villagers);
  if (take) return take;
  for (const { phrase, id } of ACTION_PHRASES) {
    if (c !== phrase && !c.startsWith(`${phrase} `)) continue;
    const after = c.slice(phrase.length).trim();
    if (WALK_ON_RE.test(after) && /^(run|jog)$/.test(phrase)) return null;
    const rest = after.replace(/^(with|to|on)\s+/, "").trim();
    return { type: "act", action: id, target: takesPartner(id) ? matchVillager(rest, villagers) : null };
  }
  return null;
}

function parseClause(clause: string, villagers: string[]): TwinCommand | null {
  if (FREE_RE.test(clause)) return { type: "free" };

  const act = parseAction(clause, villagers);
  if (act) return act;

  const talk = TALK_RE.exec(clause);
  if (talk && !aboutSomeoneElse(clause, talk.index)) {
    const name = matchVillager(talk[1] ?? talk[2] ?? "", villagers);
    if (name) return { type: "talk_to", targetName: name };
  }
  const trTalk = TR_TALK_RE.exec(clause);
  if (trTalk) {
    const name = villagers.find((v) => trTalk[1].trim().toLowerCase().endsWith(v.toLowerCase()));
    if (name) return { type: "talk_to", targetName: name };
  }

  const go = GO_RE.exec(clause);
  if (go && !aboutSomeoneElse(clause, go.index)) {
    const name = matchVillager(go[1], villagers);
    if (name) return { type: "talk_to", targetName: name };
    const zone = normalizeZone(go[1]);
    if (zone) return { type: "go", zone };
  }
  if (TR_GO_RE.test(clause)) {
    const zone = normalizeZone(clause);
    if (zone) return { type: "go", zone };
  }

  const stay = STAY_RE.exec(clause);
  if (stay && !aboutSomeoneElse(clause, stay.index)) return { type: "stay" };
  return null;
}

/** Detect a clear owner command in a chat message. Returns null for normal conversation. */
export function parseCommand(message: string, villagers: string[]): TwinCommand | null {
  const clauses = message.toLowerCase().split(/[.!?;,\n]+/).map((c) => c.trim()).filter(Boolean);
  for (const c of clauses) {
    const cmd = parseClause(c, villagers);
    if (cmd) return cmd;
  }
  return null;
}

export interface AppliedCommand {
  twin: Twin;
  /** the villager to talk to / act with */
  target: Twin | null;
  changed: boolean;
  /** why the twin won't (or can't) do it, in plain words */
  refusal?: string;
  /** exactly what the twin must say instead of the model's reply (e.g. too tired) */
  reply?: string;
  /** "take X to Y": X said no, the twin goes alone */
  declinedBy?: Twin;
}

/** Too tired for that: say so, and go and rest instead (an automatic order — the twin's own idea). */
function goRest(twin: Twin, now: Date, random: () => number): AppliedCommand {
  const stamina = staminaOf(twin);
  const zone = restPlaceFor(stamina, random);
  const res = resolveAction({ action: REST_ACTION[zone] });
  const action: PerformedAction | null = res.ok ? res.action : null;
  return {
    twin: {
      ...twin,
      locationZone: zone,
      stamina: staminaAfter(stamina, action, zone),
      order: {
        kind: "act", auto: true, zone, targetName: null,
        label: action ? action.label : `Resting at ${zoneName(zone)}`,
        action,
        issuedAt: now.toISOString(),
        holdUntil: new Date(now.getTime() + (action ? actHoldMs(action) : ORDER_HOLD_MS)).toISOString()
      }
    },
    target: null,
    changed: true,
    reply: TIRED_REPLY
  };
}

const findTwin = (all: Twin[], self: Twin, name: string | null) =>
  name ? all.find((t) => t.id !== self.id && t.name.toLowerCase() === name.toLowerCase()) : undefined;

/**
 * Turn a command into the twin's new state: location + held owner order. Pure.
 * `feelingOf(targetId)` = how that twin feels about this one (−100..100) — touch needs consent.
 */
export function applyCommand(
  twin: Twin,
  cmd: TwinCommand,
  all: Twin[],
  now: Date,
  feelingOf: (targetId: string) => number = () => 0,
  random: () => number = Math.random
): AppliedCommand {
  const tired = isTired(staminaOf(twin));
  const hold = (o: Omit<OwnerOrder, "issuedAt" | "holdUntil">): OwnerOrder => ({
    ...o,
    issuedAt: now.toISOString(),
    holdUntil: new Date(now.getTime() + ORDER_HOLD_MS).toISOString()
  });

  switch (cmd.type) {
    case "free":
      return { twin: { ...twin, order: null }, target: null, changed: Boolean(twin.order) };
    case "stay":
      return {
        twin: { ...twin, order: hold({ kind: "stay", zone: twin.locationZone, targetName: null, label: `Staying at ${zoneName(twin.locationZone)}` }) },
        target: null,
        changed: true
      };
    case "go":
      if (tired && isTiring(null, cmd.zone)) return goRest(twin, now, random);
      return {
        twin: {
          ...twin,
          locationZone: cmd.zone,
          stamina: staminaAfter(staminaOf(twin), null, cmd.zone),
          order: hold({ kind: "go", zone: cmd.zone, targetName: null, label: `Heading to ${zoneName(cmd.zone)}` })
        },
        target: null,
        changed: true
      };
    case "talk_to": {
      const target = findTwin(all, twin, cmd.targetName);
      if (!target) return { twin, target: null, changed: false, refusal: `I can't find ${cmd.targetName} in the village` };
      return {
        twin: {
          ...twin,
          locationZone: target.locationZone,
          order: hold({
            kind: "talk_to", zone: target.locationZone, targetName: target.name,
            label: cmd.message ? `Going to tell ${target.name} something` : `Going to talk to ${target.name}`,
            message: cmd.message ?? null
          })
        },
        target,
        changed: true
      };
    }
    case "act": {
      const resolved = resolveAction({ action: cmd.action, target: cmd.target, label: cmd.label, emoji: cmd.emoji });
      if (!resolved.ok) return { twin, target: null, changed: false, refusal: resolved.reason };
      const action = resolved.action;
      const target = findTwin(all, twin, action.targetName);
      if (action.targetName && !target) {
        return { twin, target: null, changed: false, refusal: `I can't find ${action.targetName} in the village` };
      }
      const def = findAction(action.id);
      // a place activity happens AT the place (an invited partner comes along); touch goes to the partner
      const atPlace = Boolean(action.place && placeOf(action.place));
      const zone = atPlace ? action.place! : target ? target.locationZone : action.place ?? twin.locationZone;
      if (tired && isTiring(action, zone)) return goRest(twin, now, random);
      const said = Boolean(target && def && !consentGiven(def, feelingOf(target.id)));
      const tooTired = Boolean(target && isTired(staminaOf(target)) && isTiring(action, zone));
      // a declined invitation: the twin goes alone; a refused touch still plays out as a refusal
      const declinedBy = atPlace && target && (said || tooTired) ? target : undefined;
      const partner = declinedBy ? undefined : target;
      const stamina = staminaAfter(staminaOf(twin), action, zone);
      return {
        twin: {
          ...twin,
          locationZone: zone,
          stamina,
          order: {
            kind: "act",
            zone,
            targetName: partner?.name ?? null,
            label: partner
              ? atPlace ? `Going to ${action.label} with ${partner.name}` : `Going to ${action.label} ${partner.name}`
              : `Going to ${action.label}`,
            action: { ...action, targetName: partner?.name ?? null, refused: Boolean(partner && !atPlace && said) },
            issuedAt: now.toISOString(),
            holdUntil: new Date(now.getTime() + actHoldMs(action)).toISOString()
          }
        },
        target: partner ?? null,
        changed: true,
        ...(declinedBy ? { declinedBy } : {})
      };
    }
  }
}

/** Short in-character confirmation, used when the model gave no spoken reply. */
export function commandAck(_twinName: string, cmd: TwinCommand): string {
  switch (cmd.type) {
    case "go":
      return `On my way to ${zoneName(cmd.zone)}!`;
    case "talk_to":
      return cmd.message ? `I'll tell ${cmd.targetName} right away.` : `Going to find ${cmd.targetName} right now.`;
    case "act": {
      const def = findAction(cmd.action);
      return `${def?.emoji ?? cmd.emoji ?? "✨"} On it — ${def?.label ?? cmd.label ?? cmd.action}!`;
    }
    case "stay":
      return "Okay, I'll stay right here.";
    case "free":
      return "Free again! Back to village life.";
  }
}
