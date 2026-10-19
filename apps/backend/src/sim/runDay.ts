import { randomUUID } from "node:crypto";
import {
  toWorldState, DEFAULT_ZONES, DAILY_ENERGY, labelFor, isOrderActive,
  resolveAction, findAction, consentGiven, actHoldMs,
  type WorldState, type Twin, type Memory, type Structure, type LlmClient,
  type BeatResult, type SocialMove
} from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import type { DB } from "../db/client.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleStructureRepository } from "../db/structureRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { DrizzleApprovalRepository } from "../db/approvalRepository.js";
import { DrizzleRelationshipRepository } from "../db/relationshipRepository.js";
import { DrizzleConversationRepository, twinRefs, type NewConversation } from "../db/conversationRepository.js";
import { spendBeat } from "../economy/energy.js";
import { planBeat } from "../agent/planner.js";
import { converse } from "./conversation.js";
import { isBusyNow, isSettledNow, orderEnergy, settled, staminaOf, withDish } from "./activity.js";

export interface DayResult {
  /** One WorldState snapshot per beat — the client plays these back over time. */
  frames: WorldState[];
  structuresBuilt: number; // kept for API compat; the v2 loop is social, not construction
}

export interface RunDayOptions {
  /** Run only this twin (a "catch-up" — e.g. right after its owner approves). */
  onlyTwinId?: string;
  /** Run only these twins (v3 world clock picks a few actors per tick). */
  onlyTwinIds?: string[];
  /** Beats to run (defaults to the full daily energy). */
  beats?: number;
  /**
   * v3 continuous mode: spend the twin's PERSISTED energy instead of granting a
   * fresh budget for this run. The world clock refills it once per UTC day.
   */
  useStoredEnergy?: boolean;
  /** Optional DB override — used by integration tests to inject a testcontainer DB. */
  db?: DB;
}

interface WorkingTwin {
  twin: Twin;
  recent: Memory[];
  /** What the owner told this twin in chat (kind "owner_fact") — fuels the planner. */
  ownerFacts: string[];
  pending: BeatResult | null;
  acted: boolean;
}

/** Feeling shifts for approved big moves: [actor→target, target→actor]. */
const MOVE_DELTAS: Record<SocialMove, [number, number]> = {
  confront: [-12, -18],
  confess: [15, 12],
  party: [10, 8],
  reconcile: [14, 10]
};

const MOVE_NARRATIVE: Record<SocialMove, (a: string, b: string) => string> = {
  confront: (a, b) => `${a} squares up and confronts ${b} in front of everyone — weeks of tension finally boil over.`,
  confess: (a, b) => `${a} pulls ${b} aside and tells them they are the best friend ${a} has in this village.`,
  party: (a, b) => `${a} throws a party in ${b}'s honour — lights, music, the whole village invited.`,
  reconcile: (a, b) => `${a} walks up to ${b}, takes a breath, and offers to bury the hatchet.`
};

/** Deterministic spread offsets so multiple pairs at the same venue don't stack. */
const SCENE_SPREAD = [
  { dc: 0, dr: 0 },
  { dc: 1.4, dr: 1.2 },
  { dc: -1.3, dr: 1.3 },
  { dc: 1.2, dr: -1.2 }
];

/**
 * Run one simulated day of village drama: every twin chats, bonds, schemes and
 * occasionally proposes a big social move (owner-gated). Relationships shift,
 * label crossings become drama moments, and each beat is snapshotted for
 * client playback.
 */
export async function runDay(llm: LlmClient, opts: RunDayOptions = {}): Promise<DayResult> {
  const db = opts.db ?? getDb();
  const twinRepo = new DrizzleTwinRepository(db);
  const structRepo = new DrizzleStructureRepository(db);
  const memRepo = new DrizzleMemoryRepository(db);
  const approvalRepo = new DrizzleApprovalRepository(db);
  const relRepo = new DrizzleRelationshipRepository(db);

  const runStartedAt = new Date(); // frames are stamped with this read time
  const loaded = await twinRepo.listAll();
  const beats = Math.min(opts.beats ?? DAILY_ENERGY, DAILY_ENERGY);
  const actorIds = opts.onlyTwinIds ?? (opts.onlyTwinId ? [opts.onlyTwinId] : null);
  const actors = actorIds ? loaded.filter((t) => actorIds.includes(t.id)) : loaded;
  const bystanders = actorIds ? loaded.filter((t) => !actorIds.includes(t.id)) : [];
  const allNames = loaded.map((t) => t.name);
  const twinByName = new Map(loaded.map((t) => [t.name, t] as const));

  const work: WorkingTwin[] = await Promise.all(
    actors.map(async (t) => {
      // Preload context: the twin remembers its recent life AND what its owner
      // told it in chat (owner facts drive gossip, goals and choices).
      const past = await memRepo.recent(t.id, 10);
      return {
        twin: opts.useStoredEnergy
          ? t
          : { ...t, energy: beats, energyUpdatedAt: new Date().toISOString() },
        recent: past.filter((m) => m.kind !== "owner_fact").slice(0, 3).reverse(),
        ownerFacts: past.filter((m) => m.kind === "owner_fact").map((m) => m.content).slice(0, 4),
        pending: null,
        acted: false
      };
    })
  );

  // Local relationship scores (kept in sync as deltas persist).
  const rel = new Map<string, number>();
  for (const r of await relRepo.listAll()) rel.set(`${r.fromTwinId}:${r.toTwinId}`, r.score);
  const scoreOf = (from: string, to: string) => rel.get(`${from}:${to}`) ?? 0;
  const shift = async (from: string, to: string, delta: number): Promise<string | null> => {
    const before = labelFor(scoreOf(from, to));
    const updated = await relRepo.applyDelta(from, to, delta);
    rel.set(`${from}:${to}`, updated.score);
    const after = labelFor(updated.score);
    return after !== before ? after : null;
  };

  const structures: Structure[] = await structRepo.listAll(); // scenery
  const newMemories: Memory[] = [];
  /** Full conversations for the Talks tab, saved with the memories at the end. */
  const newConversations: NewConversation[] = [];
  const says: Record<string, string> = {};
  const frames: WorldState[] = [];

  const remember = (twinId: string, kind: string, content: string, importance = 1) => {
    const m: Memory = { id: randomUUID(), twinId, kind, content, importance, createdAt: new Date().toISOString() };
    newMemories.push(m);
    return m;
  };

  const zoneByName = new Map(DEFAULT_ZONES.map((z) => [z.name, z] as const));
  const positions: Record<string, { col: number; row: number }> = {};
  for (const t of loaded) {
    const z = zoneByName.get(t.locationZone) ?? DEFAULT_ZONES[0];
    positions[t.id] = { col: z.col, row: z.row };
  }
  for (const t of bystanders) {
    const recent = await memRepo.recent(t.id, 1);
    if (recent.length > 0) says[t.id] = recent[0].content;
  }

  const WORK_PATROL = [
    { dc: 0, dr: 0 }, { dc: 1.6, dr: -0.5 }, { dc: 0.5, dr: 1.6 }, { dc: -1.6, dr: 0.5 }, { dc: -0.5, dr: -1.6 }
  ];
  const hashId = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  const patrolFor = (twinId: string, beat: number) => WORK_PATROL[(beat + hashId(twinId)) % WORK_PATROL.length];

  // Busy twins (swimming, riding, asleep…) can't be pulled into a scene; settled ones
  // (eating at the café, watching a film…) have scenes come to them and aren't moved.
  const busyIds = new Set(loaded.filter((t) => isBusyNow(t, runStartedAt)).map((t) => t.id));
  const settledIds = new Set(loaded.filter((t) => isSettledNow(t, runStartedAt)).map((t) => t.id));
  const isBusyName = (name: string | null | undefined) => {
    const t = name ? twinByName.get(name) : undefined;
    return Boolean(t && busyIds.has(t.id));
  };

  // Owner orders: a twin following its owner's order stays put — scenes come to it.
  const orderZone = (t: Twin): string | null => (isOrderActive(t.order, runStartedAt) ? t.order!.zone : null);
  const sceneVenue = (actor: Twin, target: Twin, fallback: string): string =>
    orderZone(target) ?? orderZone(actor) ?? fallback;

  /** Apply an executed big move: deltas, moments, memories, bubbles. */
  const executeMove = async (actor: Twin, kind: SocialMove, target: Twin, zone: string): Promise<void> => {
    const [dAB, dBA] = MOVE_DELTAS[kind];
    const crossA = await shift(actor.id, target.id, dAB);
    const crossB = await shift(target.id, actor.id, dBA);
    const line = MOVE_NARRATIVE[kind](actor.name, target.name);
    remember(actor.id, "bigmove", line, 3);
    remember(target.id, "bigmove", line, 3);
    says[actor.id] = line;
    let moment: string | null = null;
    if (crossB) {
      moment = `${target.name} now sees ${actor.name} as a ${crossB}.`;
      remember(actor.id, "moment", moment, 2);
      remember(target.id, "moment", moment, 2);
    } else if (crossA) {
      moment = `${actor.name} now sees ${target.name} as a ${crossA}.`;
      remember(actor.id, "moment", moment, 2);
    }
    newConversations.push({ zone, kind: "bigmove", twins: twinRefs([actor, target]), lines: [{ speaker: actor.name, text: line }], moment });
  };

  for (let beat = 0; beat < beats; beat++) {
    // Plan every acting twin's beat in parallel.
    await Promise.all(
      work.map(async (w) => {
        w.acted = false;
        const spent = spendBeat(w.twin);
        if (!spent.ok) return;
        w.twin = spent.twin;
        w.acted = true;
        const relations = loaded
          .filter((o) => o.id !== w.twin.id && scoreOf(w.twin.id, o.id) !== 0)
          .map((o) => ({ name: o.name, label: labelFor(scoreOf(w.twin.id, o.id)) as string }))
          .slice(0, 6);
        try {
          w.pending = await planBeat(
            w.twin,
            {
              nearbyTwinNames: allNames.filter((n) => n !== w.twin.name && !isBusyName(n)).slice(0, 5),
              recentMemories: [...w.recent].slice(-3).reverse(),
              relationships: relations,
              ownerFacts: w.ownerFacts
            },
            llm
          );
        } catch {
          w.pending = { verb: "scheme", target: null, kind: null, narrative: `${w.twin.name} keeps to themselves for a moment.` };
        }
      })
    );

    // Per-beat, per-venue scene counter for deterministic spread offsets.
    const venueSceneCount: Record<string, number> = {};
    const nextSceneOffset = (venueZone: string): { dc: number; dr: number } => {
      const idx = venueSceneCount[venueZone] ?? 0;
      venueSceneCount[venueZone] = idx + 1;
      return SCENE_SPREAD[idx % SCENE_SPREAD.length];
    };

    // Track twins already placed in a social scene this beat — their solo-action
    // position update is skipped so a target doesn't overwrite the scene placement.
    const placedThisBeat = new Set<string>();

    // Helper: place both participants of a scene at a specific venue.
    const placeAtVenue = (
      actorId: string,
      targetId: string,
      venueZone: string,
      actorOffset: { dc: number; dr: number },
      targetOffset: { dc: number; dr: number }
    ) => {
      const vz = zoneByName.get(venueZone) ?? DEFAULT_ZONES[0];
      const spread = nextSceneOffset(venueZone);
      // a settled twin stays exactly where it is doing its thing
      if (!settledIds.has(actorId)) positions[actorId] = { col: vz.col + actorOffset.dc + spread.dc, row: vz.row + actorOffset.dr + spread.dr };
      if (!settledIds.has(targetId)) positions[targetId] = { col: vz.col + targetOffset.dc + spread.dc, row: vz.row + targetOffset.dr + spread.dr };
      placedThisBeat.add(actorId);
      placedThisBeat.add(targetId);
    };

    // Helper: update locationZone for actor (WorkingTwin) and optionally the target.
    const updateZones = (actorW: WorkingTwin, targetTwin: Twin | undefined, zone: string) => {
      if (!settledIds.has(actorW.twin.id)) actorW.twin = { ...actorW.twin, locationZone: zone };
      if (targetTwin && !settledIds.has(targetTwin.id)) {
        const targetW = work.find((ww) => ww.twin.id === targetTwin.id);
        if (targetW) targetW.twin = { ...targetW.twin, locationZone: zone };
      }
    };

    // Apply outcomes sequentially.
    for (const w of work) {
      if (!w.acted || !w.pending) continue;
      // If this twin was already placed in a social scene by an earlier actor this
      // beat, skip its solo-positioning so the scene placement is not overwritten.
      if (placedThisBeat.has(w.twin.id)) continue;
      let beatResult = w.pending;

      // Legacy-verb safety: the model shouldn't emit these anymore, but coerce if it does.
      if (beatResult.verb === "work") beatResult = { ...beatResult, verb: "scheme", target: null };
      if (beatResult.verb === "socialize") beatResult = { ...beatResult, verb: "chat" };

      // Owner-approved big move waiting? It happens NOW, overriding whatever was planned.
      if (w.twin.ownerUserId) {
        const actionable = await approvalRepo.nextActionableForTwin(w.twin.id);
        if (actionable && "move" in actionable.payload) {
          const target = twinByName.get(actionable.payload.targetName);
          if (target) {
            await approvalRepo.markConsumed(actionable.id);
            // Plaza (THE STAGE): actor at {dc:-1, dr:0}, target at {dc:+0.8, dr:0}.
            const venue = sceneVenue(w.twin, target, "plaza");
            await executeMove(w.twin, actionable.payload.move, target, venue);
            placeAtVenue(w.twin.id, target.id, venue, { dc: -1, dr: 0 }, { dc: 0.8, dr: 0 });
            updateZones(w, target, venue);
            w.recent.push(remember(w.twin.id, "note", "carried out the approved plan"));
            continue;
          }
        }
      }

      // a busy twin is out of reach until its activity ends
      const targetTwin = beatResult.target && !isBusyName(beatResult.target) ? twinByName.get(beatResult.target) : undefined;

      if (beatResult.verb === "chat" && targetTwin && targetTwin.id !== w.twin.id) {
        try {
          const convo = await converse(
            { a: w.twin, b: targetTwin, scoreAtoB: scoreOf(w.twin.id, targetTwin.id), scoreBtoA: scoreOf(targetTwin.id, w.twin.id) },
            llm
          );
          const crossA = await shift(w.twin.id, targetTwin.id, convo.deltaAtoB);
          const crossB = await shift(targetTwin.id, w.twin.id, convo.deltaBtoA);
          const myLine = convo.lines.filter((l) => l.speaker === w.twin.name).pop();
          const theirLine = convo.lines.filter((l) => l.speaker === targetTwin.name).pop();
          if (myLine) says[w.twin.id] = `"${myLine.text}"`;
          if (theirLine) says[targetTwin.id] = `"${theirLine.text}"`;
          const summary = convo.moment ?? `${w.twin.name} and ${targetTwin.name} talked: "${(myLine ?? convo.lines[0]).text}"`;
          w.recent.push(remember(w.twin.id, "chat", summary, convo.moment ? 2 : 1));
          remember(targetTwin.id, "chat", summary, convo.moment ? 2 : 1);
          for (const cross of [crossA ? `${w.twin.name} now sees ${targetTwin.name} as a ${crossA}.` : null, crossB ? `${targetTwin.name} now sees ${w.twin.name} as a ${crossB}.` : null]) {
            if (cross) {
              remember(w.twin.id, "moment", cross, 2);
              remember(targetTwin.id, "moment", cross, 2);
            }
          }
          // Café (maker_space): actor at {dc:-0.8, dr:+0.3}, target at {dc:+0.6, dr:-0.3}.
          const venue = sceneVenue(w.twin, targetTwin, "maker_space");
          newConversations.push({
            zone: venue, kind: "chat", twins: twinRefs([w.twin, targetTwin]),
            lines: convo.lines, moment: convo.moment ?? null
          });
          placeAtVenue(w.twin.id, targetTwin.id, venue, { dc: -0.8, dr: 0.3 }, { dc: 0.6, dr: -0.3 });
          updateZones(w, targetTwin, venue);
        } catch {
          w.recent.push(remember(w.twin.id, "chat", beatResult.narrative));
          says[w.twin.id] = beatResult.narrative;
        }
      } else if (beatResult.verb === "bond" && targetTwin && targetTwin.id !== w.twin.id) {
        const crossA = await shift(w.twin.id, targetTwin.id, 5);
        const crossB = await shift(targetTwin.id, w.twin.id, 3);
        w.recent.push(remember(w.twin.id, "bond", beatResult.narrative));
        remember(targetTwin.id, "bond", beatResult.narrative);
        says[w.twin.id] = beatResult.narrative;
        const cross = crossB ?? crossA;
        if (cross) {
          const who = crossB ? targetTwin.name : w.twin.name;
          const whom = crossB ? w.twin.name : targetTwin.name;
          const momentText = `${who} now sees ${whom} as a ${cross}.`;
          remember(w.twin.id, "moment", momentText, 2);
          remember(targetTwin.id, "moment", momentText, 2);
        }
        // Lawn (event_space): actor at {dc:-0.8, dr:+0.3}, target at {dc:+0.6, dr:-0.3}.
        const venue = sceneVenue(w.twin, targetTwin, "event_space");
        placeAtVenue(w.twin.id, targetTwin.id, venue, { dc: -0.8, dr: 0.3 }, { dc: 0.6, dr: -0.3 });
        updateZones(w, targetTwin, venue);
      } else if (beatResult.verb === "bigmove" && targetTwin && beatResult.kind) {
        if (!w.twin.ownerUserId) {
          // NPCs act on impulse — no owner to ask.
          // Plaza (THE STAGE): actor at {dc:-1, dr:0}, target at {dc:+0.8, dr:0}.
          const venue = sceneVenue(w.twin, targetTwin, "plaza");
          await executeMove(w.twin, beatResult.kind, targetTwin, venue);
          placeAtVenue(w.twin.id, targetTwin.id, venue, { dc: -1, dr: 0 }, { dc: 0.8, dr: 0 });
          updateZones(w, targetTwin, venue);
        } else if (await approvalRepo.hasPendingForTwin(w.twin.id)) {
          const line = `${w.twin.name} is bursting to act but waits for your decision.`;
          w.recent.push(remember(w.twin.id, "note", line));
          says[w.twin.id] = line;
        } else {
          await approvalRepo.create({
            userId: w.twin.ownerUserId,
            twinId: w.twin.id,
            kind: "social_move",
            payload: { move: beatResult.kind, targetName: targetTwin.name }
          });
          const line = `${w.twin.name} wants to ${beatResult.kind === "confess" ? "open up to" : beatResult.kind} ${targetTwin.name} — and asks you first.`;
          w.recent.push(remember(w.twin.id, "note", line, 2));
          says[w.twin.id] = line;
        }
      } else if (beatResult.verb === "act" && beatResult.action && !orderZone(w.twin)) {
        // v4: the twin's own AI picked a real action — the client walks there and performs it.
        const res = resolveAction({ action: beatResult.action, target: isBusyName(beatResult.target) ? null : beatResult.target, emoji: beatResult.emoji });
        const partner = res.ok && res.action.targetName ? twinByName.get(res.action.targetName) : undefined;
        if (!res.ok || (res.action.targetName && (!partner || partner.id === w.twin.id))) {
          // unsafe, impossible or no such partner: nothing happens
          const line = `${w.twin.name} thinks better of it.`;
          w.recent.push(remember(w.twin.id, "note", line));
          says[w.twin.id] = line;
        } else {
          const def = findAction(res.action.id);
          const refused = partner && def ? !consentGiven(def, scoreOf(partner.id, w.twin.id)) : false;
          const action = withDish({ ...res.action, ...(partner ? { refused } : {}) });
          const partnerZone = partner ? (work.find((ww) => ww.twin.id === partner.id)?.twin ?? partner).locationZone : null;
          // a place activity happens at the place (a partner is invited along); touch goes to the partner
          const zone = (action.place && zoneByName.has(action.place) ? action.place : null) ?? partnerZone ?? action.place ?? w.twin.locationZone;
          w.twin = {
            ...settled(w.twin, runStartedAt),
            locationZone: zone,
            order: {
              ...orderEnergy(staminaOf(w.twin, runStartedAt), action, zone),
              kind: "act", auto: true, zone, targetName: partner?.name ?? null,
              label: partner ? `${action.label} ${partner.name}` : action.label,
              issuedAt: runStartedAt.toISOString(),
              holdUntil: new Date(runStartedAt.getTime() + actHoldMs(action)).toISOString(),
              action
            }
          };
          const zz = zoneByName.get(zone) ?? DEFAULT_ZONES[0];
          positions[w.twin.id] = { col: zz.col, row: zz.row };
          if (partner && refused) {
            await shift(w.twin.id, partner.id, -3);
            const line = `${partner.name} said no to ${/^[aeiou]/i.test(action.label) ? "an" : "a"} ${action.label} from ${w.twin.name}.`;
            w.recent.push(remember(w.twin.id, "act", line));
            remember(partner.id, "act", line);
            says[w.twin.id] = line;
          } else {
            if (partner) {
              await shift(w.twin.id, partner.id, 3);
              await shift(partner.id, w.twin.id, 2);
              remember(partner.id, "act", beatResult.narrative);
            }
            w.recent.push(remember(w.twin.id, "act", beatResult.narrative));
            says[w.twin.id] = beatResult.narrative;
          }
        }
      } else if (orderZone(w.twin)) {
        // Following the owner's order: the beat still happens (narrative), but in place.
        const zz = zoneByName.get(orderZone(w.twin)!) ?? DEFAULT_ZONES[0];
        positions[w.twin.id] = { col: zz.col, row: zz.row };
        w.recent.push(remember(w.twin.id, beatResult.verb === "move" ? "note" : "scheme", beatResult.narrative));
        says[w.twin.id] = beatResult.narrative;
      } else if (beatResult.verb === "move" && beatResult.target && zoneByName.has(beatResult.target)) {
        w.twin = { ...w.twin, locationZone: beatResult.target };
        const zz = zoneByName.get(beatResult.target)!;
        positions[w.twin.id] = { col: zz.col, row: zz.row };
        w.recent.push(remember(w.twin.id, "move", beatResult.narrative));
        says[w.twin.id] = beatResult.narrative;
      } else {
        // scheme (or an unresolvable target): solo action at network_hub (quiet corner).
        const nhz = zoneByName.get("network_hub") ?? DEFAULT_ZONES[0];
        const off = patrolFor(w.twin.id, beat);
        positions[w.twin.id] = { col: nhz.col + off.dc, row: nhz.row + off.dr };
        w.twin = { ...w.twin, locationZone: "network_hub" };
        w.recent.push(remember(w.twin.id, "scheme", beatResult.narrative));
        says[w.twin.id] = beatResult.narrative;
      }
    }

    frames.push(
      toWorldState({
        zones: DEFAULT_ZONES,
        twins: [...work.map((w) => w.twin), ...bystanders],
        structures,
        saysByTwinId: says,
        positionsByTwinId: { ...positions },
        now: runStartedAt
      })
    );
  }

  for (const w of work) await twinRepo.save(w.twin);
  for (const m of newMemories) await memRepo.append(m);
  // Saving a conversation must never break the sim.
  const convoRepo = new DrizzleConversationRepository(db);
  for (const c of newConversations) {
    try {
      await convoRepo.add(c);
    } catch (e) {
      console.error("saving a conversation failed:", e);
    }
  }

  return { frames, structuresBuilt: 0 };
}
