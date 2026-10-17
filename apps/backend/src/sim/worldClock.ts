import { CHATTINESS_PACE, isOrderActive, type Chattiness, type LlmClient, type Twin, type WorldState } from "@aivillage/shared";
import type { DB } from "../db/client.js";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { runDay } from "./runDay.js";

/**
 * v4: the village lives while the player watches — and pauses when the app is
 * closed (nothing runs in the background, nobody's AI key is spent offline).
 * There is no daily cap: every tick a couple of twins take one AI beat, paced by
 * the player's "chattiness" setting, paid by the player's own AI.
 */

/** How often a tick happens. */
export function tickIntervalMs(chattiness: Chattiness): number {
  return CHATTINESS_PACE[chattiness].tickMs;
}

/**
 * Pick which twins act this tick. Pure & testable. Twins following their
 * owner's order are busy and never picked.
 */
export function pickActors(twins: Twin[], opts: { maxActors: number; now: Date; random: () => number }): Twin[] {
  const pool = twins.filter((t) => !isOrderActive(t.order, opts.now));
  const chosen: Twin[] = [];
  while (pool.length > 0 && chosen.length < opts.maxActors) {
    chosen.push(pool.splice(Math.floor(opts.random() * pool.length), 1)[0]);
  }
  return chosen;
}

export interface WorldClockOptions {
  emitFrames: (frames: WorldState[]) => void;
  /** is any browser showing the village right now? */
  isWatched: () => boolean;
  /** the player's AI, or null when none is set up yet */
  getLlm: () => Promise<LlmClient | null>;
  getChattiness: () => Promise<Chattiness>;
  db?: DB;
  now?: () => Date;
  random?: () => number;
  /** injectable for tests: one tick of village life */
  runTick?: (llm: LlmClient, chattiness: Chattiness) => Promise<WorldState[]>;
}

export interface WorldClock {
  stop(): void;
  /** Run one tick immediately (also used by tests). */
  tick(): Promise<WorldState[]>;
}

export function startWorldClock(opts: WorldClockOptions): WorldClock {
  const now = opts.now ?? (() => new Date());
  const random = opts.random ?? Math.random;
  /** a couple of twins take one AI beat each */
  const defaultRunTick = async (llm: LlmClient, chattiness: Chattiness): Promise<WorldState[]> => {
    const db = opts.db ?? getDb();
    const actors = pickActors(await new DrizzleTwinRepository(db).listAll(), {
      maxActors: CHATTINESS_PACE[chattiness].actors, now: now(), random
    });
    if (actors.length === 0) return [];
    return (await runDay(llm, { onlyTwinIds: actors.map((a) => a.id), beats: 1, db })).frames;
  };
  const runTick = opts.runTick ?? defaultRunTick;
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<WorldState[]> => {
    if (running || !opts.isWatched()) return []; // paused: nobody is watching
    running = true;
    try {
      const llm = await opts.getLlm();
      if (!llm) return []; // no AI set up yet
      const frames = await runTick(llm, await opts.getChattiness());
      if (frames.length > 0) opts.emitFrames(frames);
      return frames;
    } catch (e) {
      console.error("world clock tick failed:", e);
      return [];
    } finally {
      running = false;
    }
  };

  // self-scheduling loop so a chattiness change applies from the next tick
  const loop = async () => {
    if (stopped) return;
    await tick();
    let wait = 60_000;
    try {
      wait = tickIntervalMs(await opts.getChattiness());
    } catch {
      /* keep the default */
    }
    if (!stopped) timer = setTimeout(() => void loop(), wait);
  };
  timer = setTimeout(() => void loop(), 5_000);

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
    tick
  };
}
