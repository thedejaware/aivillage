import { randomUUID } from "node:crypto";
import type { Twin } from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";

const NPCS = [
  { name: "Mehmet", zone: "plaza", traits: ["chaotic inventor", "can't keep a secret"], goals: ["be admired by everyone in the village"] },
  { name: "Aiko", zone: "maker_space", traits: ["meticulous perfectionist", "quietly competitive"], goals: ["prove she is the smartest in the village"] },
  { name: "Daniel", zone: "event_space", traits: ["flamboyant showman", "hates being ignored"], goals: ["be the centre of every conversation"] },
  { name: "Ravi", zone: "network_hub", traits: ["gentle peacemaker", "secretly ambitious"], goals: ["become the village's most trusted friend"] }
];

/** Seed the world with NPC twins if it's empty. Returns the twin count. */
export async function seedIfEmpty(): Promise<number> {
  const repo = new DrizzleTwinRepository(getDb());
  const existing = await repo.listAll();
  if (existing.length > 0) return existing.length;

  for (const n of NPCS) {
    const twin: Twin = {
      id: randomUUID(),
      ownerUserId: null,
      name: n.name,
      traits: n.traits,
      goals: n.goals,
      avatarSpriteUrl: null,
      skills: { building: 0, coding: 0, art: 0, social: 0 },
      reputation: 0,
      locationZone: n.zone,
      energy: 0,
      energyUpdatedAt: new Date(0).toISOString(),
      isNpc: true
    };
    await repo.save(twin);
  }
  return NPCS.length;
}
