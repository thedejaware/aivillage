import { isOrderActive, type LlmClient, type Twin, type WorldState } from "@aivillage/shared";
import type { DB } from "../db/client.js";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { grantDailyEnergy } from "../economy/energy.js";
import { runDay } from "./runDay.js";

/**
 * v3: the village lives ALL the time — no "Live a day" button.
 * Every tick a few energy-holding twins take one beat; beats are probabilistically
 * spread across the remaining UTC day so drama unfolds in real time instead of
 * burning the whole energy budget in ten minutes.
 */

export interface WorldClockOptions {
  intervalMs?: number;        // default WORLD_TICK_SECONDS env or 120s
  maxActorsPerTick?: number;  // default WORLD_MAX_ACTORS_PER_TICK env or 2
  db?: DB;
  /** injectable for tests */
  now?: () => Date;
  random?: () => number;
}

const msLeftInUtcDay = (now: Date): number => {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, end - now.getTime());
};

/**
 * Pick which twins act this tick. Pure & testable.
 * Each energy-holding twin acts with probability `remainingBeats / remainingTicks`
 * (≥ a small floor so the village never feels dead), capped at `maxActors`.
 */
export function pickActors(
  twins: Twin[],
  opts: { maxActors: number; intervalMs: number; now: Date; random: () => number }
): Twin[] {
  // Twins following an owner order are busy — the clock leaves them alone.
  const withEnergy = twins.filter((t) => t.energy > 0 && !isOrderActive(t.order, opts.now));
  if (withEnergy.length === 0) return [];
  const remainingTicks = Math.max(1, Math.floor(msLeftInUtcDay(opts.now) / opts.intervalMs));
  const chosen: Twin[] = [];
  for (const t of withEnergy) {
    const p = Math.max(0.05, Math.min(1, t.energy / remainingTicks));
    if (opts.random() < p) chosen.push(t);
    if (chosen.length >= opts.maxActors) break;
  }
  // Never let a tick be empty while the village still has lots of unspent energy:
  if (chosen.length === 0 && withEnergy.length > 0 && opts.random() < 0.5) {
    chosen.push(withEnergy[Math.floor(opts.random() * withEnergy.length)]);
  }
  return chosen;
}

export interface WorldClock {
  stop(): void;
  /** Run one tick immediately (also used by tests/manual trigger). */
  tick(): Promise<WorldState[]>;
}

export function startWorldClock(
  emitFrames: (frames: WorldState[]) => void,
  llm: LlmClient,
  opts: WorldClockOptions = {}
): WorldClock {
  const intervalMs = opts.intervalMs ?? Number(process.env.WORLD_TICK_SECONDS ?? 60) * 1000;
  const maxActors = opts.maxActorsPerTick ?? Number(process.env.WORLD_MAX_ACTORS_PER_TICK ?? 2);
  const now = opts.now ?? (() => new Date());
  const random = opts.random ?? Math.random;
  let running = false;

  const tick = async (): Promise<WorldState[]> => {
    if (running) return []; // never overlap slow ticks
    running = true;
    try {
      const db = opts.db ?? getDb();
      const twinRepo = new DrizzleTwinRepository(db);
      const twins = await twinRepo.listAll();

      // Daily refill (persisted, once per UTC day per twin).
      const today = now();
      for (const t of twins) {
        const refilled = grantDailyEnergy(t, today);
        if (refilled !== t) await twinRepo.save(refilled);
      }

      const refreshed = await twinRepo.listAll();
      const actors = pickActors(refreshed, { maxActors, intervalMs, now: today, random });
      if (actors.length === 0) return [];

      const { frames } = await runDay(llm, {
        onlyTwinIds: actors.map((a) => a.id),
        beats: 1,
        useStoredEnergy: true,
        db
      });
      if (frames.length > 0) emitFrames(frames);
      return frames;
    } catch (e) {
      console.error("world clock tick failed:", e);
      return [];
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => void tick(), intervalMs);
  void tick(); // first beat right away so a fresh server feels alive
  return { stop: () => clearInterval(handle), tick };
}
