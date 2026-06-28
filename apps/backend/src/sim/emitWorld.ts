import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Twin, ProjectType, Structure, WorldZone } from "@aivillage/shared";
import { toWorldState } from "@aivillage/shared";
import { CannedLlmClient } from "./cannedLlm.js";
import { runTwinBeats, type RunDeps } from "./runTwinBeats.js";

// Runs a simulated day and writes the resulting WorldState to the web app's
// public dir, so the renderer shows the village AFTER the simulation.
//   pnpm --filter @aivillage/backend exec tsx src/sim/emitWorld.ts

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

const ZONES: WorldZone[] = [
  { name: "plaza", col: 3, row: 3 },
  { name: "maker_space", col: 0, row: 5 },
  { name: "network_hub", col: 6, row: 0 },
  { name: "event_space", col: 6, row: 6 }
];

function makeDeps(type: ProjectType): RunDeps {
  return {
    newProjectId: () => id("p"),
    newStructureId: () => id("s"),
    newMemoryId: () => id("m"),
    now: () => new Date().toISOString(),
    chooseProjectType: () => type,
    contextFor: () => ({ nearbyTwinNames: [], recentMemories: [] })
  };
}

function twin(name: string, zone: string): Twin {
  return {
    id: id("t"), ownerUserId: null, name, traits: [], goals: [],
    avatarSpriteUrl: null, skills: { building: 0, coding: 0, art: 0, social: 0 },
    reputation: 0, locationZone: zone, energy: 5,
    energyUpdatedAt: new Date().toISOString(), isNpc: true
  };
}

const beat = (verb: string, target: string | null, narrative: string) =>
  JSON.stringify({ verb, target, narrative });

interface Resident { twin: Twin; type: ProjectType; script: string[]; }

const residents: Resident[] = [
  { twin: twin("Mehmet", "plaza"), type: "fountain", script: [
    beat("work", null, "sketching the basin"),
    beat("work", null, "laying the stonework"),
    beat("work", null, "fitting the water jets"),
    beat("socialize", "Lena", "chatting with Lena"),
    beat("work", null, "starting a second tier")
  ] },
  { twin: twin("Aiko", "maker_space"), type: "workshop", script: [
    beat("work", null, "framing the workshop"),
    beat("work", null, "wiring the benches"),
    beat("work", null, "raising the roof"),
    beat("move", "plaza", "off to see the fountain"),
    beat("work", null, "tinkering with a gadget")
  ] },
  { twin: twin("Daniel", "event_space"), type: "stage", script: [
    beat("work", null, "building the stage"),
    beat("socialize", "crowd", "rallying the crowd"),
    beat("work", null, "rigging the lights"),
    beat("work", null, "sound-checking"),
    beat("work", null, "final touches")
  ] },
  { twin: twin("Ravi", "network_hub"), type: "garden", script: [
    beat("work", null, "tilling the soil"),
    beat("work", null, "planting seedlings"),
    beat("work", null, "laying the path"),
    beat("socialize", "Sam", "swapping ideas with Sam"),
    beat("work", null, "watering the beds")
  ] }
];

async function main(): Promise<void> {
  const finalTwins: Twin[] = [];
  const structures: Structure[] = [];
  const says: Record<string, string> = {};

  for (const r of residents) {
    const res = await runTwinBeats(r.twin, null, new CannedLlmClient(r.script), makeDeps(r.type));
    finalTwins.push(res.twin);
    structures.push(...res.structuresBuilt);
    if (res.narratives.length) says[res.twin.id] = res.narratives[res.narratives.length - 1];
  }

  const world = toWorldState({ zones: ZONES, twins: finalTwins, structures, saysByTwinId: says });

  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(here, "../../../web/public/world.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(world, null, 2));
  console.log(`wrote ${out} — ${world.twins.length} twins, ${world.structures.length} structures`);
}

main();
