import { randomAppearance, type LlmClient } from "@aivillage/shared";
import type { NewTwin } from "./village.js";

/**
 * "Fill with random villagers": random looks from the avatar parts; the AI
 * writes names + personalities (one call). Presets cover no-AI / bad answers.
 */

export const PRESET_VILLAGERS: { name: string; personality: string; goal: string }[] = [
  { name: "Ravi Patel", personality: "gentle peacemaker, secretly ambitious", goal: "become the village's most trusted friend" },
  { name: "Aiko Mori", personality: "sharp-tongued artist", goal: "paint the whole village" },
  { name: "Daniel Brooks", personality: "loud, loyal and dramatic", goal: "throw the party of the year" },
  { name: "Sena Kaya", personality: "curious bookworm", goal: "know everyone's secrets" },
  { name: "Murat Yılmaz", personality: "proud cook", goal: "open the best café stand" },
  { name: "Lena Fischer", personality: "cheerful runner", goal: "get everyone exercising" },
  { name: "Omar Haddad", personality: "calm gardener", goal: "make the lawn bloom" },
  { name: "Grace Lee", personality: "nosy gossip with a big heart", goal: "match-make two villagers" },
  { name: "Pablo Ruiz", personality: "guitar-playing dreamer", goal: "perform on the stage" },
  { name: "Mia Novak", personality: "shy inventor", goal: "build something amazing" },
  { name: "Kwame Mensah", personality: "funny storyteller", goal: "make everyone laugh" },
  { name: "Ines Costa", personality: "competitive and stubborn", goal: "top the village standings" }
];

function buildPrompt(count: number, taken: string[]): string {
  return [
    `Invent ${count} new residents for a small, cosy village full of friendships, rivalries and gossip.`,
    `Give each a realistic full name (varied cultures), a short personality (max 8 words) and one social goal (max 10 words).`,
    taken.length ? `Do not use these names: ${taken.join(", ")}.` : "",
    `Respond ONLY with a JSON array: [{"name":"...","personality":"...","goal":"..."}]`
  ].filter(Boolean).join("\n");
}

function parse(raw: string): { name: string; personality: string; goal: string }[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as unknown[];
    return arr.flatMap((x) => {
      const o = x as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
      if (!name) return [];
      return [{
        name,
        personality: typeof o.personality === "string" ? o.personality.trim().slice(0, 80) : "",
        goal: typeof o.goal === "string" ? o.goal.trim().slice(0, 100) : ""
      }];
    });
  } catch {
    return [];
  }
}

export async function generateVillagers(
  count: number,
  llm: LlmClient | null,
  takenNames: string[],
  random: () => number = Math.random
): Promise<NewTwin[]> {
  if (count <= 0) return [];
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  let people: { name: string; personality: string; goal: string }[] = [];
  if (llm) {
    try {
      people = parse(await llm.generate(buildPrompt(count, takenNames)));
    } catch (e) {
      console.error("random villagers: AI failed, using presets", e);
    }
  }
  people = people.filter((p) => !taken.has(p.name.toLowerCase()));
  if (people.length < count) {
    const presets = PRESET_VILLAGERS.filter((p) => !taken.has(p.name.toLowerCase()) && !people.some((q) => q.name === p.name));
    while (people.length < count && presets.length > 0) people.push(presets.splice(Math.floor(random() * presets.length), 1)[0]);
  }
  const zones = ["plaza", "maker_space", "network_hub", "event_space"];
  return people.slice(0, count).map((p) => ({
    name: p.name,
    personality: p.personality,
    goal: p.goal,
    role: "villager",
    appearance: randomAppearance(random),
    zone: zones[Math.floor(random() * zones.length)]
  }));
}
