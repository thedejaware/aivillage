import { DEFAULT_ZONES, ZONE_DISPLAY, ORDER_HOLD_MS } from "@aivillage/shared";
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

function parseClause(clause: string, villagers: string[]): TwinCommand | null {
  if (FREE_RE.test(clause)) return { type: "free" };

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
  /** the villager to talk to (talk_to only) */
  target: Twin | null;
  changed: boolean;
}

/** Turn a command into the twin's new state: location + held owner order. Pure. */
export function applyCommand(twin: Twin, cmd: TwinCommand, all: Twin[], now: Date): AppliedCommand {
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
      const target = all.find((t) => t.id !== twin.id && t.name.toLowerCase() === cmd.targetName.toLowerCase());
      if (!target) return { twin, target: null, changed: false };
      return {
        twin: {
          ...twin,
          locationZone: target.locationZone,
          order: hold({ kind: "talk_to", zone: target.locationZone, targetName: target.name, label: `Going to talk to ${target.name}` })
        },
        target,
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
      return `Going to find ${cmd.targetName} right now.`;
    case "stay":
      return "Okay, I'll stay right here.";
    case "free":
      return "Free again! Back to village life.";
  }
}
