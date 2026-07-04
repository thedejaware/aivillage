import { randomUUID } from "node:crypto";
import {
  toWorldState, DEFAULT_ZONES, DAILY_ENERGY, labelFor,
  type WorldState, type Twin, type Memory, type Structure, type LlmClient,
  type BeatResult, type SocialMove
} from "@aivillage/shared";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleStructureRepository } from "../db/structureRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { DrizzleApprovalRepository } from "../db/approvalRepository.js";
import { DrizzleRelationshipRepository } from "../db/relationshipRepository.js";
import { spendBeat } from "../economy/energy.js";
import { planBeat } from "../agent/planner.js";
import { converse } from "./conversation.js";

export interface DayResult {
  /** One WorldState snapshot per beat — the client plays these back over time. */
  frames: WorldState[];
  structuresBuilt: number; // kept for API compat; the v2 loop is social, not construction
}

export interface RunDayOptions {
  /** Run only this twin (a "catch-up" — e.g. right after its owner approves). */
  onlyTwinId?: string;
  /** Beats to run (defaults to the full daily energy). */
  beats?: number;
}

interface WorkingTwin {
  twin: Twin;
  recent: Memory[];
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

/**
 * Run one simulated day of village drama: every twin chats, bonds, schemes and
 * occasionally proposes a big social move (owner-gated). Relationships shift,
 * label crossings become drama moments, and each beat is snapshotted for
 * client playback.
 */
export async function runDay(llm: LlmClient, opts: RunDayOptions = {}): Promise<DayResult> {
  const db = getDb();
  const twinRepo = new DrizzleTwinRepository(db);
  const structRepo = new DrizzleStructureRepository(db);
  const memRepo = new DrizzleMemoryRepository(db);
  const approvalRepo = new DrizzleApprovalRepository(db);
  const relRepo = new DrizzleRelationshipRepository(db);

  const loaded = await twinRepo.listAll();
  const beats = Math.min(opts.beats ?? DAILY_ENERGY, DAILY_ENERGY);
  const actors = opts.onlyTwinId ? loaded.filter((t) => t.id === opts.onlyTwinId) : loaded;
  const bystanders = opts.onlyTwinId ? loaded.filter((t) => t.id !== opts.onlyTwinId) : [];
  const allNames = loaded.map((t) => t.name);
  const twinByName = new Map(loaded.map((t) => [t.name, t] as const));

  const work: WorkingTwin[] = actors.map((t) => ({
    twin: { ...t, energy: beats, energyUpdatedAt: new Date().toISOString() },
    recent: [],
    pending: null,
    acted: false
  }));

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

  /** Apply an executed big move: deltas, moments, memories, bubbles. */
  const executeMove = async (actor: Twin, kind: SocialMove, target: Twin): Promise<void> => {
    const [dAB, dBA] = MOVE_DELTAS[kind];
    const crossA = await shift(actor.id, target.id, dAB);
    const crossB = await shift(target.id, actor.id, dBA);
    const line = MOVE_NARRATIVE[kind](actor.name, target.name);
    remember(actor.id, "bigmove", line, 3);
    remember(target.id, "bigmove", line, 3);
    says[actor.id] = line;
    if (crossB) {
      const momentText = `${target.name} now sees ${actor.name} as a ${crossB}.`;
      remember(actor.id, "moment", momentText, 2);
      remember(target.id, "moment", momentText, 2);
    } else if (crossA) {
      remember(actor.id, "moment", `${actor.name} now sees ${target.name} as a ${crossA}.`, 2);
    }
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
              nearbyTwinNames: allNames.filter((n) => n !== w.twin.name).slice(0, 5),
              recentMemories: [...w.recent].slice(-3).reverse(),
              relationships: relations
            },
            llm
          );
        } catch {
          w.pending = { verb: "scheme", target: null, kind: null, narrative: `${w.twin.name} keeps to themselves for a moment.` };
        }
      })
    );

    // Apply outcomes sequentially.
    for (const w of work) {
      if (!w.acted || !w.pending) continue;
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
            await executeMove(w.twin, actionable.payload.move, target);
            const tp = positions[target.id];
            positions[w.twin.id] = { col: tp.col - 1, row: tp.row };
            w.recent.push(remember(w.twin.id, "note", "carried out the approved plan"));
            continue;
          }
        }
      }

      const targetTwin = beatResult.target ? twinByName.get(beatResult.target) : undefined;
      const z = zoneByName.get(w.twin.locationZone) ?? DEFAULT_ZONES[0];

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
          if (myLine) says[w.twin.id] = `“${myLine.text}”`;
          if (theirLine) says[targetTwin.id] = `“${theirLine.text}”`;
          const summary = convo.moment ?? `${w.twin.name} and ${targetTwin.name} talked: “${(myLine ?? convo.lines[0]).text}”`;
          w.recent.push(remember(w.twin.id, "chat", summary, convo.moment ? 2 : 1));
          remember(targetTwin.id, "chat", summary, convo.moment ? 2 : 1);
          for (const cross of [crossA ? `${w.twin.name} now sees ${targetTwin.name} as a ${crossA}.` : null, crossB ? `${targetTwin.name} now sees ${w.twin.name} as a ${crossB}.` : null]) {
            if (cross) {
              remember(w.twin.id, "moment", cross, 2);
              remember(targetTwin.id, "moment", cross, 2);
            }
          }
          const tp = positions[targetTwin.id];
          positions[w.twin.id] = { col: tp.col - 1, row: tp.row };
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
        const tp = positions[targetTwin.id];
        positions[w.twin.id] = { col: tp.col - 1, row: tp.row };
      } else if (beatResult.verb === "bigmove" && targetTwin && beatResult.kind) {
        if (!w.twin.ownerUserId) {
          // NPCs act on impulse — no owner to ask.
          await executeMove(w.twin, beatResult.kind, targetTwin);
          const tp = positions[targetTwin.id];
          positions[w.twin.id] = { col: tp.col - 1, row: tp.row };
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
      } else if (beatResult.verb === "move" && beatResult.target && zoneByName.has(beatResult.target)) {
        w.twin = { ...w.twin, locationZone: beatResult.target };
        const zz = zoneByName.get(beatResult.target)!;
        positions[w.twin.id] = { col: zz.col, row: zz.row };
        w.recent.push(remember(w.twin.id, "move", beatResult.narrative));
        says[w.twin.id] = beatResult.narrative;
      } else {
        // scheme (or an unresolvable target): a solo social action.
        const off = patrolFor(w.twin.id, beat);
        positions[w.twin.id] = { col: z.col + off.dc, row: z.row + off.dr };
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
        positionsByTwinId: { ...positions }
      })
    );
  }

  for (const w of work) await twinRepo.save(w.twin);
  for (const m of newMemories) await memRepo.append(m);

  return { frames, structuresBuilt: 0 };
}
