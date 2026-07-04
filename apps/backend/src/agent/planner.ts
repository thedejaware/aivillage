import type { Twin, BeatResult, Verb, SocialMove, LlmClient, Memory } from "@aivillage/shared";

export interface PlanContext {
  nearbyTwinNames: string[];
  recentMemories: Memory[];
  /** this twin's current feelings toward others, as "Name: label" pairs */
  relationships?: { name: string; label: string }[];
  /** legacy (v1 build loop) — ignored by the social prompt */
  activeProject?: { type: string; stepsDone: number; stepsTotal: number } | null;
}

export function buildPrompt(twin: Twin, ctx: PlanContext): string {
  const memo = ctx.recentMemories.map((m) => `- ${m.content}`).join("\n") || "- (nothing yet)";
  const rels =
    ctx.relationships && ctx.relationships.length > 0
      ? ctx.relationships.map((r) => `- ${r.name}: ${r.label}`).join("\n")
      : "- you barely know anyone yet";
  return [
    `You are ${twin.name}, living in AiVillage — a small village buzzing with friendships, rivalries and gossip.`,
    `Personality: ${twin.traits.join(", ") || "unremarkable"}. Your social goal: ${twin.goals.join(", ") || "find your place"}.`,
    `You are at "${twin.locationZone}". Villagers around: ${ctx.nearbyTwinNames.join(", ") || "no one"}.`,
    `How you feel about people:\n${rels}`,
    `What you just did:\n${memo}`,
    `Choose ONE action for this moment. Options:`,
    `- "chat": strike up a conversation (target = a villager's name)`,
    `- "bond": a kind gesture toward someone — help, gift, invite (target = name)`,
    `- "scheme": advance your social goal quietly (target = null)`,
    `- "move": go to another zone (target = zone name)`,
    `- "bigmove": a BIG dramatic step — kind must be one of "confront" (a rival), "confess" (declare someone your closest friend), "party" (throw one, target = guest of honour), "reconcile" (make peace). Your owner must approve it first, so use it when it truly matters.`,
    `Stay in character, react to how you feel about people, do NOT repeat what you just did.`,
    `Respond ONLY with strict JSON: {"verb":"chat|bond|scheme|move|bigmove","target":<name-or-zone-or-null>,"kind":<confront|confess|party|reconcile|null>,"narrative":"<one vivid third-person sentence>"}`
  ].join("\n");
}

const VALID_VERBS: Verb[] = ["work", "socialize", "move", "chat", "bond", "scheme", "bigmove"];
const VALID_MOVES: SocialMove[] = ["confront", "confess", "party", "reconcile"];

export function parseBeat(raw: string): BeatResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object found in LLM response");
  const obj = JSON.parse(match[0]) as { verb?: string; target?: string | null; kind?: string | null; narrative?: string };
  if (!obj.verb || !VALID_VERBS.includes(obj.verb as Verb)) {
    throw new Error(`invalid verb: ${String(obj.verb)}`);
  }
  let kind: SocialMove | null = null;
  if (obj.verb === "bigmove") {
    if (!obj.kind || !VALID_MOVES.includes(obj.kind as SocialMove)) {
      throw new Error(`invalid bigmove kind: ${String(obj.kind)}`);
    }
    kind = obj.kind as SocialMove;
  }
  return { verb: obj.verb as Verb, target: obj.target ?? null, kind, narrative: String(obj.narrative ?? "") };
}

export async function planBeat(twin: Twin, ctx: PlanContext, llm: LlmClient): Promise<BeatResult> {
  const raw = await llm.generate(buildPrompt(twin, ctx));
  return parseBeat(raw);
}
