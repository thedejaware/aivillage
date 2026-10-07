import {
  colorForId, isOrderActive, labelFor, orderStatus, ZONE_DISPLAY,
  type TwinDetail
} from "@aivillage/shared";
import type { DB } from "../db/client.js";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { DrizzleRelationshipRepository } from "../db/relationshipRepository.js";
import { popularityScores } from "../sim/popularity.js";
import { OWNER_FACT_KIND } from "../chat/twinChat.js";

/**
 * The Inspector card for any villager. Public view: the owner's private facts
 * (what they told their twin in chat) never leave the owner's own panel.
 */
export async function twinDetail(
  twinId: string,
  viewerUserId: string | null,
  dbOverride?: DB,
  now: Date = new Date()
): Promise<TwinDetail | null> {
  const db = dbOverride ?? getDb();
  const twins = await new DrizzleTwinRepository(db).listAll();
  const twin = twins.find((t) => t.id === twinId);
  if (!twin) return null;

  const relRepo = new DrizzleRelationshipRepository(db);
  const allRels = await relRepo.listAll();
  const pop = popularityScores(allRels);
  const ranked = [...twins].sort((a, b) => (pop.get(b.id) ?? 0) - (pop.get(a.id) ?? 0));
  const nameOf = new Map(twins.map((t) => [t.id, t.name] as const));

  const relationships = allRels
    .filter((r) => r.fromTwinId === twin.id && r.score !== 0 && nameOf.has(r.toTwinId))
    .sort((a, b) => b.score - a.score)
    .map((r) => ({ name: nameOf.get(r.toTwinId)!, label: labelFor(r.score), score: r.score }));

  const recent = (await new DrizzleMemoryRepository(db).recent(twin.id, 12))
    .filter((m) => m.kind !== OWNER_FACT_KIND)
    .slice(0, 8)
    .map((m) => ({ id: m.id, kind: m.kind, content: m.content, createdAt: m.createdAt }));

  const order = twin.order && isOrderActive(twin.order, now) ? twin.order : null;

  return {
    id: twin.id,
    name: twin.name,
    colorHex: colorForId(twin.id),
    isNpc: twin.isNpc,
    isMine: viewerUserId !== null && twin.ownerUserId === viewerUserId,
    traits: twin.traits,
    goals: twin.goals,
    zone: twin.locationZone,
    zoneLabel: ZONE_DISPLAY[twin.locationZone] ?? twin.locationZone,
    reputation: twin.reputation,
    energy: twin.energy,
    popularity: pop.get(twin.id) ?? 0,
    rank: ranked.findIndex((t) => t.id === twin.id) + 1,
    villagerCount: twins.length,
    orderStatus: order ? orderStatus(order, false) : null,
    relationships,
    recent
  };
}
