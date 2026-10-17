import { DEFAULT_ZONES, ZONE_DISPLAY, ORDER_HOLD_MS, ACT_HOLD_MS, ACTIONS, findAction, resolveAction, consentGiven } from "@aivillage/shared";
import type { Twin, TwinCommand, OwnerOrder } from "@aivillage/shared";

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
    quiet: "network_hub", corner: "network_hub", bench: "network_hub"
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

/** Every way people name an action, longest first ("high five" before "high"). */
const ACTION_PHRASES: { phrase: string; id: string }[] = ACTIONS
  .filter((a) => a.id !== "chat") // talking is talk_to
  .flatMap((a) => [a.id.replace(/_/g, " "), a.label, ...(a.aliases ?? [])].map((phrase) => ({ phrase: phrase.toLowerCase(), id: a.id })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

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
  for (const { phrase, id } of ACTION_PHRASES) {
    if (c !== phrase && !c.startsWith(`${phrase} `)) continue;
    const def = findAction(id)!;
    const rest = c.slice(phrase.length).replace(/^\s*(with|to|on)\s+/, "").trim();
    return { type: "act", action: id, target: def.target ? matchVillager(rest, villagers) : null };
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
  feelingOf: (targetId: string) => number = () => 0
): AppliedCommand {
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
      return {
        twin: { ...twin, locationZone: cmd.zone, order: hold({ kind: "go", zone: cmd.zone, targetName: null, label: `Heading to ${zoneName(cmd.zone)}` }) },
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
      const refused = Boolean(target && def && !consentGiven(def, feelingOf(target.id)));
      const zone = target ? target.locationZone : action.place ?? twin.locationZone;
      return {
        twin: {
          ...twin,
          locationZone: zone,
          order: {
            kind: "act",
            zone,
            targetName: target?.name ?? null,
            label: target ? `Going to ${action.label} ${target.name}` : `Going to ${action.label}`,
            action: { ...action, targetName: target?.name ?? null, refused },
            issuedAt: now.toISOString(),
            holdUntil: new Date(now.getTime() + ACT_HOLD_MS).toISOString()
          }
        },
        target: target ?? null,
        changed: true
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
