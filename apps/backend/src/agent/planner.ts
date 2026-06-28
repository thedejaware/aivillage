import type { Twin, BeatResult, Verb, LlmClient, Memory } from "@aivillage/shared";

export interface PlanContext {
  nearbyTwinNames: string[];
  recentMemories: Memory[];
  activeProject?: { type: string; stepsDone: number; stepsTotal: number } | null;
}

export function buildPrompt(twin: Twin, ctx: PlanContext): string {
  const memo = ctx.recentMemories.map((m) => `- ${m.content}`).join("\n") || "- (nothing yet)";
  const p = ctx.activeProject;
  const projectLine = p
    ? `You are partway through building a ${p.type} (${p.stepsDone}/${p.stepsTotal} steps done). Choosing "work" advances it; finishing it leaves a real mark on the village.`
    : `You haven't started building anything yet. Your aim is tangible progress on your goal — that means choosing "work" to start and build a project.`;
  return [
    `You are ${twin.name}, a resident of AiVillage. Traits: ${twin.traits.join(", ") || "none"}. Goals: ${twin.goals.join(", ") || "none"}.`,
    `You are at zone "${twin.locationZone}". Nearby: ${ctx.nearbyTwinNames.join(", ") || "no one"}.`,
    projectLine,
    `Recent things you just did:\n${memo}`,
    `Energy is limited today, so make it count. Strongly prefer "work" to make real progress on your goal. Use "socialize" only occasionally, and "move" only to reach somewhere you need. Do NOT repeat an action you just did.`,
    `Choose ONE action for this beat. Respond ONLY with strict JSON: {"verb":"work|socialize|move","target":<zone-or-name-or-null>,"narrative":<short sentence>}.`
  ].join("\n");
}

const VALID_VERBS: Verb[] = ["work", "socialize", "move"];

export function parseBeat(raw: string): BeatResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object found in LLM response");
  const obj = JSON.parse(match[0]) as { verb?: string; target?: string | null; narrative?: string };
  if (!obj.verb || !VALID_VERBS.includes(obj.verb as Verb)) {
    throw new Error(`invalid verb: ${String(obj.verb)}`);
  }
  return { verb: obj.verb as Verb, target: obj.target ?? null, narrative: String(obj.narrative ?? "") };
}

export async function planBeat(twin: Twin, ctx: PlanContext, llm: LlmClient): Promise<BeatResult> {
  const raw = await llm.generate(buildPrompt(twin, ctx));
  return parseBeat(raw);
}
