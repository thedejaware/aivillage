import { randomUUID } from "node:crypto";
import { toWorldState, DEFAULT_ZONES, type LlmClient, type WorldState } from "@aivillage/shared";
import type { DB } from "../db/client.js";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleStructureRepository } from "../db/structureRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { DrizzleRelationshipRepository } from "../db/relationshipRepository.js";
import { converse } from "./conversation.js";

/**
 * The owner said "talk to Ravi": once the twin has walked over, they really
 * talk. One frame per spoken line, so the caption bar plays the whole exchange.
 * Feelings shift and both twins remember it. Never throws — a failed brain
 * just means no conversation.
 */
export async function talkOnArrival(actorId: string, targetId: string, llm: LlmClient, dbOverride?: DB): Promise<WorldState[]> {
  const db = dbOverride ?? getDb();
  const twinRepo = new DrizzleTwinRepository(db);
  const relRepo = new DrizzleRelationshipRepository(db);
  const memRepo = new DrizzleMemoryRepository(db);

  const readAt = new Date();
  const all = await twinRepo.listAll();
  const actor = all.find((t) => t.id === actorId);
  const target = all.find((t) => t.id === targetId);
  if (!actor || !target) return [];

  let convo;
  try {
    convo = await converse(
      {
        a: actor,
        b: target,
        scoreAtoB: (await relRepo.get(actor.id, target.id))?.score ?? 0,
        scoreBtoA: (await relRepo.get(target.id, actor.id))?.score ?? 0
      },
      llm
    );
  } catch (e) {
    console.error("ordered conversation failed:", e);
    return [];
  }

  await relRepo.applyDelta(actor.id, target.id, convo.deltaAtoB);
  await relRepo.applyDelta(target.id, actor.id, convo.deltaBtoA);
  const summary = convo.moment ?? `${actor.name} went to talk to ${target.name}: "${convo.lines[0].text}"`;
  for (const twinId of [actor.id, target.id]) {
    await memRepo.append({
      id: randomUUID(), twinId, kind: "chat", content: summary,
      importance: convo.moment ? 2 : 1, createdAt: new Date().toISOString()
    });
  }

  // Both stand together where the target is.
  const zone = DEFAULT_ZONES.find((z) => z.name === target.locationZone) ?? DEFAULT_ZONES[0];
  const positionsByTwinId = {
    [actor.id]: { col: zone.col - 0.8, row: zone.row + 0.3 },
    [target.id]: { col: zone.col + 0.6, row: zone.row - 0.3 }
  };
  const structures = await new DrizzleStructureRepository(db).listAll();
  const idByName = new Map([[actor.name, actor.id], [target.name, target.id]]);

  return convo.lines.map((line) =>
    toWorldState({
      zones: DEFAULT_ZONES,
      twins: all,
      structures,
      positionsByTwinId,
      saysByTwinId: { [idByName.get(line.speaker)!]: `"${line.text}"` },
      now: readAt
    })
  );
}

/**
 * "talk to Ravi" waits for the twin to actually arrive: the owner's client
 * reports arrival; a fallback timer covers the case where no client is watching.
 */
export class TalkScheduler {
  private readonly pending = new Map<string, { targetId: string; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    private readonly run: (actorId: string, targetId: string) => void,
    private readonly fallbackMs = 20_000
  ) {}

  schedule(actorId: string, targetId: string): void {
    this.cancel(actorId);
    const timer = setTimeout(() => this.fire(actorId), this.fallbackMs);
    this.pending.set(actorId, { targetId, timer });
  }

  /** The twin reached its target. Returns false when no talk was waiting. */
  arrived(actorId: string): boolean {
    return this.fire(actorId);
  }

  cancel(actorId: string): void {
    const p = this.pending.get(actorId);
    if (p) clearTimeout(p.timer);
    this.pending.delete(actorId);
  }

  private fire(actorId: string): boolean {
    const p = this.pending.get(actorId);
    if (!p) return false;
    this.cancel(actorId);
    this.run(actorId, p.targetId);
    return true;
  }
}
