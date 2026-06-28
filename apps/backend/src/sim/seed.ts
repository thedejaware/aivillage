import { randomUUID } from "node:crypto";
import type { Twin } from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";

const NPCS = [
  { name: "Mehmet", zone: "plaza", traits: ["chaotic inventor"], goals: ["build a grand fountain in the plaza"] },
  { name: "Aiko", zone: "maker_space", traits: ["meticulous tinkerer"], goals: ["open a workshop for gadgets"] },
  { name: "Daniel", zone: "event_space", traits: ["showman"], goals: ["host a great keynote"] },
  { name: "Ravi", zone: "network_hub", traits: ["patient gardener"], goals: ["grow a community garden"] }
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
