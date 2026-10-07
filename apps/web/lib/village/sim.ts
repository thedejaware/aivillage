/**
 * VillageSim — the twins' bodies. Pure TypeScript (no three.js): the renderer
 * reads each twin's transform + pose every frame, and tests drive it directly.
 *
 * Antigravity-style ambient life at zero LLM cost:
 *  - twins walk the road network (no straight-line cutting)
 *  - venue activities: café coffee, bench sitting, lawn picnics, stage moments
 *  - canned chats when idle twins bump into each other
 * Owner orders override all of it: the twin walks where it was sent, stays,
 * and reports arrival once. Real drama still comes from the server frames.
 */
import { orderStatus, type WorldState, type WorldTwinView } from "@aivillage/shared";
import { findRoute, tileToWorld, zoneCenter, SPOTS, ISLAND_HALF, type Pt, type SpotDef, type ActivityKind } from "./layout";

/** Walking speed, world units per second. */
export const WALK_SPEED = 0.85;
const TALK_LINE_SECONDS = 2.4;
const TALK_RANGE = 1.35;
const PAIR_COOLDOWN_S = 90;
/** How long a talk target waits for its visitor. */
const HOLD_FOR_VISITOR_S = 40;
const ROAM = ISLAND_HALF - 0.8;

const ACTIVITY_EMOJI: Record<ActivityKind, string[]> = {
  coffee: ["☕", "😋", "☕"],
  bench: ["💭", "😌", "🌙"],
  blanket: ["🌸", "🎶", "😊"],
  stage: ["🎤", "✨", "💃"]
};
const ACTIVITY_DURATION: Record<ActivityKind, [number, number]> = {
  coffee: [10, 18], bench: [9, 16], blanket: [10, 18], stage: [6, 11]
};
/** Sitting pose offsets for the (unrigged) bodies — stylized but readable. */
export const SIT_DROP: Record<ActivityKind, number> = { coffee: 0, bench: 0.17, blanket: 0.2, stage: 0 };

const AMBIENT_DIALOGS: string[][] = [
  ["Psst — did you hear about {n}?", "No! Tell me everything.", "Not here. Too many ears."],
  ["The café smells amazing today.", "Race you to the counter!"],
  ["I'm plotting something big.", "You always say that.", "This time it's real."],
  ["Nice day on the island, isn't it?", "Every day is nice on a floating island."],
  ["{n} has been acting strange lately…", "Strange how?", "Stage-strange. Watch them."],
  ["My owner told me a secret.", "Ooooh. Trade you for mine?"],
  ["I want a bigger house near the lawn.", "Dream big, build bigger."]
];

export type Mode = "idle" | "walk" | "activity" | "talk";
export interface SpotState extends SpotDef { busyBy: string | null; }
type Order = WorldTwinView["order"];

export interface SimTwin {
  id: string;
  name: string;
  colorHex: number;
  // ---- what the renderer reads ----
  x: number;
  z: number;
  /** facing (three.js Y rotation; 0 = +z) */
  yaw: number;
  /** body offset/tilt for bobbing, sitting and walking sway */
  bodyY: number;
  tiltX: number;
  roll: number;
  cupVisible: boolean;
  cupLift: number;
  /** ambient speech bubble / activity emoji */
  bubble: string | null;
  /** owner-order status, e.g. "🚶 Heading to THE CAFÉ" */
  status: string | null;
  // ---- behaviour state ----
  mode: Mode;
  route: Pt[];
  onArrive: SpotState | null;
  activity: { spot: SpotState; until: number; emojiAt: number; emojiUntil: number } | null;
  talk: { partnerId: string; lines: string[]; mine: boolean[]; idx: number; nextAt: number } | null;
  order: Order;
  orderKey: string;
  orderArrived: boolean;
  heldUntil: number;
  /** last server tile target (world units) and when to start walking there */
  ax: number;
  az: number;
  nextTx: number;
  nextTz: number;
  applyAt: number;
  nextWanderAt: number;
  speedMul: number;
  walkPhase: number;
  phase: number;
}

export interface SimOptions {
  random?: () => number;
  /** fired once when a twin reaches the place its owner sent it */
  onOrderArrive?: (twinId: string, status: string) => void;
  /** wandering + canned chats (default on) */
  ambient?: boolean;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const orderKeyOf = (o: Order) => (o ? `${o.kind}:${o.zone}:${o.targetName ?? ""}` : "");

export class VillageSim {
  readonly twins = new Map<string, SimTwin>();
  readonly spots: SpotState[] = SPOTS.map((s) => ({ ...s, busyBy: null }));
  /** twin whose line is on the TV caption bar — it doesn't start side chats */
  speakingId: string | null = null;
  private readonly random: () => number;
  private readonly ambient: boolean;
  private readonly onOrderArrive?: (twinId: string, status: string) => void;
  private readonly pairCooldown = new Map<string, number>();
  private nextTalkScan = 0;

  constructor(opts: SimOptions = {}) {
    this.random = opts.random ?? Math.random;
    this.ambient = opts.ambient ?? true;
    this.onOrderArrive = opts.onOrderArrive;
  }

  // ---------------- server → sim ----------------

  /** Apply a server world snapshot: add/remove twins, new tile targets, owner orders. */
  reconcile(state: WorldState, now: number): void {
    const seen = new Set<string>();
    for (const v of state.twins) {
      seen.add(v.id);
      let tw = this.twins.get(v.id);
      if (!tw) {
        tw = this.create(v, now);
        this.twins.set(v.id, tw);
      }
      tw.name = v.name;
      tw.colorHex = v.colorHex;
      const { x: nx, z: nz } = tileToWorld(v.col, v.row);
      const key = orderKeyOf(v.order);
      if (key !== tw.orderKey) {
        tw.orderKey = key;
        tw.order = v.order;
        this.startOrder(tw, now);
      }
      if (tw.order && tw.order.kind !== "talk_to") {
        // seated by its owner — server tile updates don't drag it around
        tw.ax = nx;
        tw.az = nz;
        continue;
      }
      if (nx !== tw.ax || nz !== tw.az) {
        tw.nextTx = nx;
        tw.nextTz = nz;
        tw.applyAt = now + this.random() * 0.9;
      }
    }
    for (const [id, tw] of this.twins) {
      if (seen.has(id)) continue;
      this.stopActivity(tw);
      this.stopTalk(tw);
      this.twins.delete(id);
    }
  }

  /** Seat a twin at a spot right now (it starts the spot's activity). */
  occupySpot(twinId: string, spotId: string, now: number): void {
    const tw = this.twins.get(twinId);
    const spot = this.spots.find((s) => s.id === spotId);
    if (!tw || !spot) return;
    this.stopActivity(tw);
    this.stopTalk(tw);
    spot.busyBy = tw.id;
    tw.x = spot.x;
    tw.z = spot.z;
    tw.route = [];
    this.beginActivity(tw, spot, now);
  }

  // ---------------- per-frame ----------------

  step(now: number, dt: number): void {
    if (this.ambient && now >= this.nextTalkScan) {
      this.nextTalkScan = now + 2;
      this.matchmake(now);
    }
    for (const tw of this.twins.values()) {
      if (tw.applyAt > 0 && now >= tw.applyAt) {
        tw.applyAt = 0;
        tw.ax = tw.nextTx;
        tw.az = tw.nextTz;
        this.stopActivity(tw);
        this.stopTalk(tw);
        this.walkTo(tw, { x: tw.nextTx, z: tw.nextTz }, null);
        tw.nextWanderAt = now + 4 + this.random() * 5;
      }

      if (tw.route.length > 0) this.stepWalk(tw, now, dt);
      else if (tw.mode === "activity" && tw.activity) this.stepActivity(tw, now);
      else if (tw.mode === "talk" && tw.talk) this.stepTalk(tw, now);
      else this.stepIdle(tw, now);
    }
  }

  // ---------------- owner orders ----------------

  private startOrder(tw: SimTwin, now: number): void {
    this.stopActivity(tw);
    this.stopTalk(tw);
    tw.applyAt = 0;
    tw.orderArrived = false;
    const order = tw.order;
    if (!order) {
      tw.status = null;
      tw.route = [];
      tw.mode = "idle";
      tw.nextWanderAt = now + 1.5;
      return;
    }
    tw.status = orderStatus(order, false);
    if (order.kind === "stay") {
      tw.route = [];
      tw.mode = "idle";
      this.arriveOrder(tw);
      return;
    }
    if (order.kind === "talk_to") {
      const target = this.byName(order.targetName);
      if (target && !target.order) {
        // the target waits for its visitor instead of wandering off
        this.stopTalk(target);
        if (target.mode === "walk") {
          target.route = [];
          target.mode = "idle";
        }
        target.heldUntil = now + HOLD_FOR_VISITOR_S;
      }
      const c = target ? { x: target.x, z: target.z } : zoneCenter(order.zone);
      this.walkTo(tw, { x: c.x - 0.55, z: c.z + 0.35 }, null);
      return;
    }
    // go: take a seat at the venue — even if a free-roaming villager sits there
    const seats = this.spots.filter((s) => s.zone === order.zone);
    const spot = seats.find((s) => s.busyBy === null || s.busyBy === tw.id) ??
      seats.find((s) => !this.twins.get(s.busyBy ?? "")?.order);
    if (spot) {
      const sitter = spot.busyBy && spot.busyBy !== tw.id ? this.twins.get(spot.busyBy) : undefined;
      if (sitter) {
        this.stopActivity(sitter);
        sitter.route = [];
        sitter.onArrive = null;
        sitter.mode = "idle";
        sitter.nextWanderAt = now + 0.5;
      }
      spot.busyBy = tw.id;
      this.walkTo(tw, { x: spot.x, z: spot.z }, spot);
    } else {
      const c = zoneCenter(order.zone);
      this.walkTo(tw, { x: c.x + 0.4, z: c.z + 0.4 }, null);
    }
  }

  private arriveOrder(tw: SimTwin): void {
    if (!tw.order || tw.orderArrived) return;
    tw.orderArrived = true;
    if (tw.order.kind === "talk_to") {
      const target = this.byName(tw.order.targetName);
      if (target) tw.yaw = Math.atan2(target.x - tw.x, target.z - tw.z);
    }
    tw.status = orderStatus(tw.order, true);
    this.onOrderArrive?.(tw.id, tw.status);
  }

  // ---------------- behaviours ----------------

  private stepWalk(tw: SimTwin, now: number, dt: number): void {
    const target = tw.route[0];
    const dx = target.x - tw.x;
    const dz = target.z - tw.z;
    const d = Math.hypot(dx, dz);
    const step = WALK_SPEED * tw.speedMul * dt;
    if (d > step) {
      tw.x += (dx / d) * step;
      tw.z += (dz / d) * step;
      tw.walkPhase += dt * 9;
      let dy = Math.atan2(dx, dz) - tw.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      tw.yaw += dy * Math.min(1, dt * 8);
      tw.bodyY = Math.abs(Math.sin(tw.walkPhase)) * 0.045;
      tw.roll = Math.sin(tw.walkPhase) * 0.035;
      return;
    }
    tw.x = target.x;
    tw.z = target.z;
    tw.route.shift();
    if (tw.route.length > 0) return;

    // arrived
    tw.walkPhase = 0;
    tw.bodyY = 0;
    tw.roll = 0;
    const spot = tw.onArrive;
    tw.onArrive = null;
    if (spot && spot.busyBy === tw.id) {
      this.beginActivity(tw, spot, now);
    } else {
      tw.mode = "idle";
      tw.nextWanderAt = now + (spot ? 1 : 2 + this.random() * 4);
    }
    if (tw.order) this.arriveOrder(tw);
  }

  private beginActivity(tw: SimTwin, spot: SpotState, now: number): void {
    const [lo, hi] = ACTIVITY_DURATION[spot.kind];
    // an owner order holds the twin at its spot until the order changes
    const until = tw.order ? Infinity : now + lo + this.random() * (hi - lo);
    tw.activity = { spot, until, emojiAt: now + 1 + this.random() * 2, emojiUntil: 0 };
    tw.mode = "activity";
    tw.yaw = spot.yaw;
    tw.bodyY = -SIT_DROP[spot.kind];
    tw.tiltX = spot.kind === "bench" || spot.kind === "blanket" ? -0.1 : 0;
    tw.cupVisible = spot.kind === "coffee";
  }

  private stepActivity(tw: SimTwin, now: number): void {
    const act = tw.activity!;
    const k = act.spot.kind;
    if (k === "coffee") {
      const sip = Math.max(0, Math.sin((now * 1.4 + tw.phase) % (Math.PI * 2)));
      tw.cupLift = sip * 0.14;
      tw.bodyY = Math.sin(now * 1.1 + tw.phase) * 0.008;
    } else if (k === "stage") {
      tw.bodyY = Math.abs(Math.sin(now * 3 + tw.phase)) * 0.08; // little performance hops
      tw.yaw = act.spot.yaw + Math.sin(now * 1.4 + tw.phase) * 0.4;
    } else {
      tw.bodyY = -SIT_DROP[k] + Math.sin(now * 1.1 + tw.phase) * 0.008; // seated breathing
    }
    if (now >= act.emojiAt) {
      const pool = ACTIVITY_EMOJI[k];
      tw.bubble = pool[Math.floor(this.random() * pool.length)];
      act.emojiUntil = now + 1.8;
      act.emojiAt = now + 4 + this.random() * 4;
    } else if (act.emojiUntil > 0 && now >= act.emojiUntil) {
      tw.bubble = null;
      act.emojiUntil = 0;
    }
    if (now >= act.until) {
      this.stopActivity(tw);
      tw.mode = "idle";
      tw.nextWanderAt = now + 1 + this.random() * 3;
    }
  }

  private stepTalk(tw: SimTwin, now: number): void {
    const talk = tw.talk!;
    tw.bodyY = Math.sin(now * 1.3 + tw.phase) * 0.012;
    if (now < talk.nextAt) return;
    talk.idx += 1;
    if (talk.idx >= talk.lines.length) {
      this.stopTalk(tw);
      tw.nextWanderAt = now + 2 + this.random() * 4;
      return;
    }
    const partner = this.twins.get(talk.partnerId);
    if (talk.mine[talk.idx]) {
      tw.bubble = talk.lines[talk.idx];
      if (partner) partner.bubble = null;
    } else if (partner?.talk) {
      partner.bubble = talk.lines[talk.idx];
      tw.bubble = null;
    }
    talk.nextAt = now + TALK_LINE_SECONDS;
  }

  private stepIdle(tw: SimTwin, now: number): void {
    tw.bodyY = Math.sin(now * 1.1 + tw.phase) * 0.012;
    tw.roll = 0;
    if (!this.ambient || tw.order || tw.heldUntil > now || now < tw.nextWanderAt) return;
    const roll = this.random();
    const free = this.spots.filter((s) => s.busyBy === null);
    if (roll < 0.45 && free.length > 0) {
      // go do something at a venue (sit, sip, perform)
      const spot = free[Math.floor(this.random() * free.length)];
      spot.busyBy = tw.id;
      this.walkTo(tw, { x: spot.x, z: spot.z }, spot);
    } else if (roll < 0.8) {
      // stroll the roads to somewhere else on the island
      const dest = {
        x: clamp(tw.x + (this.random() - 0.5) * 7, -ROAM, ROAM),
        z: clamp(tw.z + (this.random() - 0.5) * 7, -ROAM, ROAM)
      };
      tw.ax = dest.x;
      tw.az = dest.z;
      this.walkTo(tw, dest, null);
    } else {
      // loiter near the current spot
      this.walkTo(tw, {
        x: clamp(tw.x + (this.random() - 0.5) * 1.4, -ROAM, ROAM),
        z: clamp(tw.z + (this.random() - 0.5) * 1.4, -ROAM, ROAM)
      }, null);
    }
    tw.nextWanderAt = now + 6 + this.random() * 9;
  }

  /** Pair up idle neighbours for a canned chat (every 2s). */
  private matchmake(now: number): void {
    const idle = [...this.twins.values()].filter(
      (tw) => tw.mode === "idle" && !tw.activity && !tw.order && tw.heldUntil <= now && this.speakingId !== tw.id && !tw.talk
    );
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i];
        const b = idle[j];
        if (a.talk || b.talk) continue;
        if (Math.hypot(a.x - b.x, a.z - b.z) > TALK_RANGE) continue;
        const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if ((this.pairCooldown.get(key) ?? 0) > now) continue;
        this.pairCooldown.set(key, now + PAIR_COOLDOWN_S + this.random() * 60);
        const raw = AMBIENT_DIALOGS[Math.floor(this.random() * AMBIENT_DIALOGS.length)];
        const others = [...this.twins.values()].filter((t) => t.id !== a.id && t.id !== b.id).map((t) => t.name);
        const n = others[Math.floor(this.random() * Math.max(1, others.length))] ?? "someone";
        const lines = raw.map((l) => l.replace("{n}", n));
        const mine = lines.map((_, k) => k % 2 === 0);
        a.talk = { partnerId: b.id, lines, mine, idx: -1, nextAt: now + 0.3 };
        b.talk = { partnerId: a.id, lines, mine: mine.map((v) => !v), idx: -1, nextAt: Infinity };
        a.mode = "talk";
        b.mode = "talk";
        a.yaw = Math.atan2(b.x - a.x, b.z - a.z);
        b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
      }
    }
  }

  // ---------------- helpers ----------------

  private create(v: WorldTwinView, now: number): SimTwin {
    const p = tileToWorld(v.col, v.row);
    return {
      id: v.id, name: v.name, colorHex: v.colorHex,
      x: p.x, z: p.z, yaw: 0, bodyY: 0, tiltX: 0, roll: 0,
      cupVisible: false, cupLift: 0, bubble: null, status: null,
      mode: "idle", route: [], onArrive: null, activity: null, talk: null,
      order: null, orderKey: "", orderArrived: false, heldUntil: 0,
      ax: p.x, az: p.z, nextTx: p.x, nextTz: p.z, applyAt: 0,
      nextWanderAt: now + 2 + this.random() * 5,
      speedMul: 0.85 + ((hash(v.id) >> 4) % 30) / 100,
      walkPhase: 0,
      phase: (hash(v.id) % 628) / 100
    };
  }

  private byName(name: string | null): SimTwin | undefined {
    if (!name) return undefined;
    for (const t of this.twins.values()) if (t.name === name) return t;
    return undefined;
  }

  private walkTo(tw: SimTwin, to: Pt, arrive: SpotState | null): void {
    tw.route = findRoute({ x: tw.x, z: tw.z }, to);
    tw.onArrive = arrive;
    tw.mode = "walk";
  }

  private stopActivity(tw: SimTwin): void {
    if (tw.activity) {
      if (tw.activity.spot.busyBy === tw.id) tw.activity.spot.busyBy = null;
      tw.activity = null;
    }
    if (tw.onArrive && tw.onArrive.busyBy === tw.id) tw.onArrive.busyBy = null;
    tw.cupVisible = false;
    tw.cupLift = 0;
    tw.bodyY = 0;
    tw.tiltX = 0;
    tw.bubble = null;
  }

  private stopTalk(tw: SimTwin): void {
    if (!tw.talk) return;
    const partner = this.twins.get(tw.talk.partnerId);
    tw.talk = null;
    tw.mode = "idle";
    tw.bubble = null;
    if (partner?.talk?.partnerId === tw.id) {
      partner.talk = null;
      partner.mode = "idle";
      partner.bubble = null;
    }
  }
}
