import type { Twin, ProjectType } from "@aivillage/shared";
import { CannedLlmClient } from "./cannedLlm.js";
import { runTwinBeats, type RunDeps, type TwinDayResult } from "./runTwinBeats.js";

// Runnable demo: seed a few NPC twins and run them through a simulated day.
// Uses the CannedLlmClient so it costs nothing and needs no API key.
//   pnpm --filter @aivillage/backend exec tsx src/sim/demo.ts

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

function makeDeps(projectType: ProjectType): RunDeps {
  return {
    newProjectId: () => id("p"),
    newStructureId: () => id("s"),
    newMemoryId: () => id("m"),
    now: () => new Date().toISOString(),
    chooseProjectType: () => projectType,
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
    beat("work", null, "sketching the fountain basin"),
    beat("work", null, "laying the stonework"),
    beat("work", null, "fitting the water jets"),
    beat("socialize", "Lena", "chatting with Lena about the plaza"),
    beat("work", null, "starting a second fountain tier")
  ] },
  { twin: twin("Aiko", "maker_space"), type: "workshop", script: [
    beat("work", null, "framing the workshop"),
    beat("work", null, "wiring the benches"),
    beat("work", null, "raising the roof"),
    beat("move", "plaza", "heading to the plaza to see the fountain"),
    beat("work", null, "tinkering with a new gadget")
  ] },
  { twin: twin("Daniel", "event_space"), type: "stage", script: [
    beat("work", null, "building the stage frame"),
    beat("socialize", "crowd", "rallying the crowd"),
    beat("work", null, "rigging the lights"),
    beat("work", null, "sound-checking the speakers"),
    beat("work", null, "final touches on the stage")
  ] }
];

async function main(): Promise<void> {
  console.log("\n══════════════════════════════════════════════════");
  console.log("   AiVillage — Simulated Day   (energy budget = 5/twin)");
  console.log("══════════════════════════════════════════════════\n");

  const built: { type: string; zone: string; by: string }[] = [];

  for (const r of residents) {
    const res: TwinDayResult = await runTwinBeats(r.twin, null, new CannedLlmClient(r.script), makeDeps(r.type));
    console.log(`▸ ${r.twin.name.padEnd(7)} @${res.twin.locationZone.padEnd(12)} ⚡${r.twin.energy}→${res.twin.energy}`);
    res.narratives.forEach((n) => console.log(`     · ${n}`));
    for (const s of res.structuresBuilt) {
      console.log(`     🏗️  built a ${s.type.toUpperCase()} at ${s.zone}!`);
      built.push({ type: s.type, zone: s.zone, by: r.twin.name });
    }
    const sk = res.twin.skills;
    console.log(`     skills → building ${sk.building} · coding ${sk.coding} · art ${sk.art} · social ${sk.social} · rep ${res.twin.reputation}\n`);
  }

  console.log("──────────────────────────────────────────────────");
  console.log(`Village grew by ${built.length} structure(s) today:`);
  for (const s of built) console.log(`   🏛️  ${s.type} @${s.zone}  (by ${s.by})`);
  console.log("══════════════════════════════════════════════════\n");
}

main();
