import type { LlmClient, Twin } from "@aivillage/shared";
import { labelFor, type ConversationResult } from "@aivillage/shared";

export interface ConversePair {
  a: Twin;
  b: Twin;
  scoreAtoB: number; // current feelings A -> B
  scoreBtoA: number; // current feelings B -> A
}

export function buildConversePrompt(p: ConversePair): string {
  const { a, b, scoreAtoB, scoreBtoA } = p;
  const labelAtoB = labelFor(scoreAtoB);
  const labelBtoA = labelFor(scoreBtoA);
  return [
    `You are writing a short in-character social exchange between two village residents.`,
    ``,
    `${a.name}: traits [${a.traits.join(", ") || "none"}], goals [${a.goals.join(", ") || "none"}].`,
    `${b.name}: traits [${b.traits.join(", ") || "none"}], goals [${b.goals.join(", ") || "none"}].`,
    ``,
    `Current relationship: ${a.name} sees ${b.name} as a ${labelAtoB} (score ${scoreAtoB}). ${b.name} sees ${a.name} as a ${labelBtoA} (score ${scoreBtoA}).`,
    ``,
    `Write a SHORT exchange of 2-4 lines, alternating between the two speakers. Then decide:`,
    `- deltaAtoB: integer in [-20,20] — how much ${a.name}'s feelings toward ${b.name} shift (most chats ±1..6; big only for conflict/bonding).`,
    `- deltaBtoA: integer in [-20,20] — how much ${b.name}'s feelings toward ${a.name} shift.`,
    `- moment: a one-line drama summary if something notable happened (new friendship, confrontation, confession, betrayal), otherwise null.`,
    ``,
    `Respond ONLY with strict JSON: {"lines":[{"speaker":"<name>","text":"..."}],"deltaAtoB":n,"deltaBtoA":n,"moment":"..."|null}.`,
  ].join("\n");
}

function clampDelta(n: unknown): number {
  const v = typeof n === "number" ? Math.round(n) : 0;
  return Math.max(-20, Math.min(20, v));
}

export function parseConversation(raw: string, aName: string, bName: string): ConversationResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object found in LLM response");
  const obj = JSON.parse(match[0]) as {
    lines?: unknown;
    deltaAtoB?: unknown;
    deltaBtoA?: unknown;
    moment?: unknown;
  };

  if (!Array.isArray(obj.lines) || obj.lines.length === 0) {
    throw new Error("conversation lines must be a non-empty array");
  }

  const validSpeakers = new Set([aName, bName]);
  for (const line of obj.lines) {
    if (typeof line !== "object" || line === null || !("speaker" in line)) {
      throw new Error("each line must be an object with speaker and text");
    }
    const l = line as { speaker?: unknown; text?: unknown };
    if (typeof l.speaker !== "string" || !validSpeakers.has(l.speaker)) {
      throw new Error(`invalid speaker: ${String(l.speaker)}; expected one of ${aName}, ${bName}`);
    }
  }

  const lines = (obj.lines as Array<{ speaker: string; text: unknown }>).map(l => ({
    speaker: l.speaker,
    text: String(l.text ?? ""),
  }));

  const deltaAtoB = clampDelta(obj.deltaAtoB);
  const deltaBtoA = clampDelta(obj.deltaBtoA);
  const moment = typeof obj.moment === "string" && obj.moment.length > 0 ? obj.moment : null;

  return { lines, deltaAtoB, deltaBtoA, moment };
}

export async function converse(p: ConversePair, llm: LlmClient): Promise<ConversationResult> {
  const raw = await llm.generate(buildConversePrompt(p));
  return parseConversation(raw, p.a.name, p.b.name);
}
