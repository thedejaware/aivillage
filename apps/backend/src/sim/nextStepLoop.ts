import { randomUUID } from "node:crypto";
import {
  NEXT_STEP_CAP, actHoldMs, consentGiven, findAction, isOrderActive, isTired, placeOf, resolveAction,
  type Chattiness, type LlmClient, type OwnerOrder, type Relationship, type Twin
} from "@aivillage/shared";
import type { DB } from "../db/client.js";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { DrizzleRelationshipRepository } from "../db/relationshipRepository.js";
import {
  nextStepContext, planNextSteps, restStep, ruleNextStep, type NextStep
} from "../agent/nextStepPlanner.js";
import { OWNER_FACT_KIND } from "../chat/twinChat.js";
import { activityDelta, isTiring, settled, staminaAfter, staminaOf } from "./activity.js";
import { claimTwins, isClaimed, releaseTwins } from "./twinLocks.js";
import { clearQueuedSteps, queuedSteps, queuedTwinIds, setQueuedSteps } from "./stepQueue.js";

/**
 * O13 in "to-do list" mode: when a twin finishes an activity it takes the next
 * step from its plan; only when the plan is empty does its AI write a new one
 * (PLAN_STEPS activities per call). Planning calls are capped per rolling minute
 * by chattiness; twins waiting for a slot loiter where they are. Nothing runs
 * while nobody watches — energy stays frozen.
 */

const TICK_MS = 5_000;
const WINDOW_MS = 60_000;

export interface NextStepLoopOptions {
  emitWorld: () => unknown;
  /** is any browser showing the village right now? */
  isWatched: () => boolean;
  /** the player's AI, or null when none is set up (rules only) */
  getLlm: () => Promise<LlmClient | null>;
  getChattiness: () => Promise<Chattiness>;
  db?: DB;
  now?: () => Date;
  random?: () => number;
}

export interface NextStepLoop {
  stop(): void;
  /** One round now (also used by tests). Returns how many twins started something. */
  tick(): Promise<number>;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Start a step: an automatic act order at the place (held for the activity +
 * the walk), energy spent or restored, a memory. An invited partner who agrees
 * (and isn't too tired for something tiring) gets the matching order; a "no" is
 * remembered and the twin goes alone.
 */
export async function applyStep(db: DB, twin: Twin, step: NextStep, now: Date): Promise<Twin> {
  const repo = new DrizzleTwinRepository(db);
  const memRepo = new DrizzleMemoryRepository(db);
  const relRepo = new DrizzleRelationshipRepository(db);

  let res = resolveAction({ action: step.action, target: step.partner });
  if (!res.ok) res = resolveAction({ action: placeOf(step.zone)?.mainAction ?? "sit" });
  if (!res.ok) return twin;
  const action = res.action;
  const zone = step.zone;

  let partner: Twin | null = null;
  let declined: Twin | null = null;
  if (step.partner) {
    const p = (await repo.listAll()).find((t) => t.id !== twin.id && sameName(t.name, step.partner!));
    if (p && !isOrderActive(p.order, now)) {
      const feeling = (await relRepo.get(p.id, twin.id))?.score ?? 0;
      const def = findAction(action.id);
      const tooTired = isTired(staminaOf(p, now)) && isTiring(action, zone);
      if (def && consentGiven(def, feeling) && !tooTired) partner = p;
      else declined = p;
    }
  }

  const orderWith = (withName: string | null, who: Twin): OwnerOrder => ({
    energyTo: staminaAfter(staminaOf(who, now), action, zone),
    kind: "act",
    auto: true,
    zone,
    targetName: withName,
    label: withName ? `${action.label} with ${withName}` : action.label,
    issuedAt: now.toISOString(),
    holdUntil: new Date(now.getTime() + actHoldMs(action)).toISOString(),
    action: { ...action, targetName: withName }
  });
  const remember = (twinId: string, content: string) =>
    memRepo.append({ id: randomUUID(), twinId, kind: "act", content, importance: 1, createdAt: now.toISOString() });

  const updated: Twin = {
    ...settled(twin, now),
    locationZone: zone,
    order: orderWith(partner?.name ?? null, twin)
  };
  await repo.save(updated);
  await remember(twin.id, step.narrative || `${twin.name} went to ${action.label}.`);

  if (partner) {
    await repo.save({ ...settled(partner, now), locationZone: zone, order: orderWith(twin.name, partner) });
    await remember(partner.id, `${partner.name} joined ${twin.name} to ${action.label}.`);
    await relRepo.applyDelta(twin.id, partner.id, 2);
    await relRepo.applyDelta(partner.id, twin.id, 2);
  } else if (declined) {
    await remember(twin.id, `${declined.name} said no when ${twin.name} asked them to ${action.label} together.`);
    await relRepo.applyDelta(twin.id, declined.id, -2);
  }
  return updated;
}

/**
 * Pick the step to start now from a plan, re-checked against the village as it
 * is: a full place is skipped; a tiring step while tired becomes rest and drops
 * the rest of the plan; a busy or missing partner means going alone. Nothing
 * usable → a rule-based step. Returns the step and what is left of the plan.
 */
function chooseStep(
  twin: Twin, plan: NextStep[], all: Twin[], now: Date, rels: Relationship[], random: () => number
): { step: NextStep; rest: NextStep[] } {
  const ctx = nextStepContext(twin, all, now, rels, []);
  const queue = [...plan];
  while (queue.length > 0) {
    const step = queue.shift()!;
    const place = ctx.places.find((p) => p.zone === step.zone);
    if (!place) continue; // full now: on to the next planned step
    if (isTired(ctx.stamina) && activityDelta(findAction(step.action) ?? null, step.zone) < 0) {
      return { step: restStep(twin, ctx, ctx.stamina, random), rest: [] };
    }
    let partner = step.partner;
    if (partner) {
      const p = all.find((t) => t.id !== twin.id && sameName(t.name, partner!));
      if (!p || isOrderActive(p.order, now) || place.free < 2) partner = null;
    }
    return { step: { ...step, partner }, rest: queue };
  }
  return { step: ruleNextStep(twin, ctx, random), rest: [] };
}

export function startNextStepLoop(opts: NextStepLoopOptions): NextStepLoop {
  const now = opts.now ?? (() => new Date());
  const random = opts.random ?? Math.random;
  /** when each AI planning call of the last minute happened */
  const calls: number[] = [];
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<number> => {
    if (running || !opts.isWatched()) return 0; // paused: nobody is watching
    running = true;
    const held: string[] = [];
    try {
      const db = opts.db ?? getDb();
      const repo = new DrizzleTwinRepository(db);
      const t = now();
      let all = await repo.listAll();

      // a plan dies with an owner order, deactivation or deletion
      const living = new Set(all.map((x) => x.id));
      for (const id of queuedTwinIds()) if (!living.has(id)) clearQueuedSteps(id);
      for (const x of all) if (isOrderActive(x.order, t) && !x.order!.auto) clearQueuedSteps(x.id);

      // due = finished its activity (or never had one); longest-waiting first
      const endOf = (x: Twin) => (x.order ? Date.parse(x.order.holdUntil) : 0);
      const due = all.filter((x) => !isOrderActive(x.order, t) && !isClaimed(x.id)).sort((a, b) => endOf(a) - endOf(b));
      if (due.length === 0) return 0;

      const llm = await opts.getLlm();
      const cap = NEXT_STEP_CAP[await opts.getChattiness()] ?? NEXT_STEP_CAP.normal;
      while (calls.length > 0 && t.getTime() - calls[0] >= WINDOW_MS) calls.shift();
      let budget = Math.max(0, cap - calls.length);

      type Job = { twin: Twin; kind: "queue" | "plan" | "rule" };
      const jobs: Job[] = [];
      for (const x of due) {
        if (queuedSteps(x.id).length > 0) jobs.push({ twin: x, kind: "queue" }); // free: no AI call
        else if (!llm) jobs.push({ twin: x, kind: "rule" });
        else if (budget > 0) {
          budget--;
          calls.push(t.getTime());
          jobs.push({ twin: x, kind: "plan" });
        } // else: waits for a planning slot, loitering where it is
      }
      if (jobs.length === 0) return 0;
      held.push(...jobs.map((j) => j.twin.id));
      claimTwins(held);

      const relRepo = new DrizzleRelationshipRepository(db);
      const memRepo = new DrizzleMemoryRepository(db);
      const rels = await relRepo.listAll();
      const plans = await Promise.all(
        jobs.map(async (j): Promise<NextStep[] | null> => {
          if (j.kind !== "plan" || !llm) return null;
          const facts = (await memRepo.recent(j.twin.id, 10)).filter((m) => m.kind === OWNER_FACT_KIND).map((m) => m.content);
          return planNextSteps(j.twin, nextStepContext(j.twin, all, t, rels, facts), llm, { random });
        })
      );

      // apply one by one on fresh state, so two twins can't take the last spot
      all = await repo.listAll();
      let started = 0;
      for (let i = 0; i < jobs.length; i++) {
        const fresh = all.find((x) => x.id === jobs[i].twin.id);
        if (!fresh) {
          clearQueuedSteps(jobs[i].twin.id);
          continue;
        }
        if (isOrderActive(fresh.order, t)) {
          // got an order meanwhile: invited along (keep the new plan for later) or the owner's (drop it)
          if (fresh.order!.auto && plans[i]) setQueuedSteps(fresh.id, plans[i]!);
          else if (!fresh.order!.auto) clearQueuedSteps(fresh.id);
          continue;
        }
        const plan = plans[i] ?? queuedSteps(fresh.id);
        const { step, rest } = chooseStep(fresh, plan, all, t, rels, random);
        setQueuedSteps(fresh.id, rest);
        await applyStep(db, fresh, step, t);
        started++;
        all = await repo.listAll();
      }
      if (started > 0) await opts.emitWorld();
      return started;
    } catch (e) {
      console.error("next-step loop tick failed:", e);
      return 0;
    } finally {
      releaseTwins(held);
      running = false;
    }
  };

  const loop = async () => {
    if (stopped) return;
    await tick();
    if (!stopped) timer = setTimeout(() => void loop(), TICK_MS);
  };
  timer = setTimeout(() => void loop(), TICK_MS);

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
    tick
  };
}
