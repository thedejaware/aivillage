/**
 * VillageSim — the twins' bodies. Pure TypeScript (no three.js): the renderer
 * reads each twin's transform + pose every frame, and tests drive it directly.
 *
 * Ambient life at zero LLM cost, around the place the AI sent each twin:
 *  - twins walk the road network (no straight-line cutting)
 *  - venue activities: café coffee, bench sitting, lawn picnics, stage moments
 *  - wordless emoji chats when idle twins bump into each other
 * WHERE a twin goes is decided by its AI (server frames), not by random strolls.
 * Owner orders override all of it: the twin walks where it was sent, stays,
 * and reports arrival once. Real drama still comes from the server frames.
 */
import { orderStatus, DEFAULT_ZONES, type BodyAnim, type TwinPose, type WorldState, type WorldTwinView } from "@aivillage/shared";
import { findRoute, tileToWorld, zoneCenter, SPOTS, ISLAND_HALF, type Pt, type SpotDef, type ActivityKind } from "./layout";

/** Walking speed, world units per second. */
export const WALK_SPEED = 0.85;
const TALK_LINE_SECONDS = 2.4;
const TALK_RANGE = 1.35;
const PAIR_COOLDOWN_S = 90;
/** How long a talk target waits for its visitor. */
const HOLD_FOR_VISITOR_S = 40;
/** How close a twin stands to its partner for a hug / high-five. */
const TOUCH_DISTANCE = 0.45;
/** A placed action starts once the twin is this close to the venue. */
const NEAR_VENUE = 1.2;
const REFUSAL_SECONDS = 3;
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
/** The avatar's "sit" puts its seat ~0.24 up (bench height); on the grass the body drops by this. */
const GROUND_SIT_DROP = 0.22;
const ACTIVITY_ANIM: Record<ActivityKind, BodyAnim> = { coffee: "drink", bench: "sit", blanket: "sit", stage: "dance" };
/** What the partner does back (a cheek kiss gets a happy laugh, not a kiss). */
const RECIPROCAL: Partial<Record<BodyAnim, BodyAnim>> = { kiss: "laugh" };

/**
 * Idle side chats are wordless (emoji only): every real word in the village
 * comes from the player's AI, never from canned lines.
 */
const AMBIENT_DIALOGS: string[][] = [
  ["👋", "👋", "😊"],
  ["☕", "😋"],
  ["🤫", "👀", "😮"],
  ["😂", "😂"],
  ["🌸", "😊"],
  ["🤔", "💡", "👍"],
  ["🎶", "💃"]
];
/** How far an idle twin drifts from where the AI last sent it. */
const LOITER = 0.7;

export type Mode = "idle" | "walk" | "activity" | "talk" | "perform";
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
  /** ambient speech bubble / activity emoji */
  bubble: string | null;
  /** owner-order status, e.g. "🚶 Heading to THE CAFÉ" */
  status: string | null;
  /** body animation + when it started (sim time, seconds) */
  anim: BodyAnim;
  animStart: number;
  // ---- behaviour state ----
  mode: Mode;
  route: Pt[];
  onArrive: SpotState | null;
  activity: { spot: SpotState; until: number; emojiAt: number; emojiUntil: number } | null;
  talk: { partnerId: string; lines: string[]; mine: boolean[]; idx: number; nextAt: number } | null;
  /** playing an action (its own, or as the partner of someone else's) */
  perform: { until: number; partnerId: string | null } | null;
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
const orderKeyOf = (o: Order) =>
  o ? `${o.kind}:${o.zone}:${o.targetName ?? ""}:${o.action?.id ?? ""}:${o.action?.refused ? 1 : 0}:${o.issuedAt ?? ""}` : "";

/** The venue nearest to a world point. */
function nearestZone(p: Pt): string {
  let best = DEFAULT_ZONES[0].name;
  let bd = Infinity;
  for (const z of DEFAULT_ZONES) {
    const c = zoneCenter(z.name);
    const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
    if (d < bd) { bd = d; best = z.name; }
  }
  return best;
}

/** Vertical body offset: sitting on the grass (blanket, or "sit" anywhere) instead of a seat. */
export function bodyLift(tw: SimTwin): number {
  return tw.anim === "sit" && tw.activity?.spot.kind !== "bench" ? -GROUND_SIT_DROP : 0;
}

/** What the avatar renderer needs each frame. */
export function avatarPose(tw: SimTwin, now: number) {
  return {
    anim: tw.anim,
    animTime: Math.max(0, now - tw.animStart),
    walking: tw.route.length > 0,
    walkPhase: tw.walkPhase,
    speed: tw.speedMul
  };
}

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

  /** Where everyone is now — saved so the village resumes exactly here. */
  poses(): (TwinPose & { id: string })[] {
    return [...this.twins.values()].map((tw) => ({ id: tw.id, x: tw.x, z: tw.z, yaw: tw.yaw, zone: nearestZone(tw) }));
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
      else if (tw.mode === "perform" && tw.perform) this.stepPerform(tw, now);
      else this.stepIdle(tw, now);
    }
  }

  // ---------------- owner orders ----------------

  private startOrder(tw: SimTwin, now: number): void {
    this.stopActivity(tw);
    this.stopTalk(tw);
    this.stopPerform(tw, now);
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
      this.arriveOrder(tw, now);
      return;
    }
    if (order.kind === "act") {
      this.startAct(tw, now);
      return;
    }
    if (order.kind === "talk_to") {
      const target = this.byName(order.targetName);
      // the target waits for its visitor instead of wandering off
      if (target) this.holdForVisitor(target, now);
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

  /** Act order: go to the partner or the venue (if needed), then perform. */
  private startAct(tw: SimTwin, now: number): void {
    const action = tw.order?.action;
    const target = action?.targetName ? this.byName(action.targetName) : undefined;
    if (target && target !== tw) {
      this.holdForVisitor(target, now);
      const dx = tw.x - target.x;
      const dz = tw.z - target.z;
      const d = Math.hypot(dx, dz) || 1;
      this.walkTo(tw, { x: target.x + (dx / d) * TOUCH_DISTANCE, z: target.z + (dz / d) * TOUCH_DISTANCE }, null);
      return;
    }
    if (action?.place) {
      const c = zoneCenter(action.place);
      if (Math.hypot(c.x - tw.x, c.z - tw.z) > NEAR_VENUE) {
        this.walkTo(tw, { x: c.x + 0.4, z: c.z + 0.4 }, null);
        return;
      }
    }
    tw.route = [];
    tw.mode = "idle";
    this.arriveOrder(tw, now);
  }

  private holdForVisitor(target: SimTwin, now: number): void {
    if (target.order) return;
    this.stopTalk(target);
    if (target.mode === "walk") {
      target.route = [];
      target.onArrive = null;
      target.mode = "idle";
    }
    target.applyAt = 0;
    target.heldUntil = now + HOLD_FOR_VISITOR_S;
  }

  /** Play the ordered action (with the partner, if any). */
  private perform(tw: SimTwin, now: number): void {
    const action = tw.order?.action;
    if (!action) return;
    const partner = action.targetName ? this.byName(action.targetName) : undefined;
    if (partner && partner !== tw) {
      this.stopActivity(partner);
      this.stopTalk(partner);
      this.stopPerform(partner, now);
      tw.yaw = Math.atan2(partner.x - tw.x, partner.z - tw.z);
      partner.yaw = Math.atan2(tw.x - partner.x, tw.z - partner.z);
    }
    const seconds = action.refused ? REFUSAL_SECONDS : action.seconds;
    const play = (who: SimTwin, anim: BodyAnim, bubble: string, partnerId: string | null) => {
      who.mode = "perform";
      who.perform = { until: now + seconds, partnerId };
      who.bubble = bubble;
      this.setAnim(who, anim, now);
    };
    if (action.refused) {
      play(tw, "think", "🙁", partner?.id ?? null);
      if (partner && partner !== tw) play(partner, "idle", "🙅", tw.id);
      return;
    }
    play(tw, action.anim, action.emoji, partner?.id ?? null);
    if (partner && partner !== tw) play(partner, RECIPROCAL[action.anim] ?? action.anim, action.emoji, tw.id);
  }

  private arriveOrder(tw: SimTwin, now: number): void {
    if (!tw.order || tw.orderArrived) return;
    tw.orderArrived = true;
    if (tw.order.kind === "talk_to") {
      const target = this.byName(tw.order.targetName);
      if (target) tw.yaw = Math.atan2(target.x - tw.x, target.z - tw.z);
    }
    if (tw.order.kind === "act") this.perform(tw, now);
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
      tw.walkPhase += (step / WALK_SPEED) * 9; // follows distance walked: no foot sliding
      let dy = Math.atan2(dx, dz) - tw.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      tw.yaw += dy * Math.min(1, dt * 8);
      return;
    }
    tw.x = target.x;
    tw.z = target.z;
    tw.route.shift();
    if (tw.route.length > 0) return;

    // arrived
    tw.walkPhase = 0;
    const spot = tw.onArrive;
    tw.onArrive = null;
    if (spot && spot.busyBy === tw.id) {
      this.beginActivity(tw, spot, now);
    } else {
      tw.mode = "idle";
      tw.nextWanderAt = now + (spot ? 1 : 2 + this.random() * 4);
    }
    if (tw.order) this.arriveOrder(tw, now);
  }

  private beginActivity(tw: SimTwin, spot: SpotState, now: number): void {
    const [lo, hi] = ACTIVITY_DURATION[spot.kind];
    // an owner order holds the twin at its spot until the order changes
    const until = tw.order ? Infinity : now + lo + this.random() * (hi - lo);
    tw.activity = { spot, until, emojiAt: now + 1 + this.random() * 2, emojiUntil: 0 };
    tw.mode = "activity";
    tw.yaw = spot.yaw;
    this.setAnim(tw, ACTIVITY_ANIM[spot.kind], now);
  }

  private stepActivity(tw: SimTwin, now: number): void {
    const act = tw.activity!;
    const k = act.spot.kind;
    if (k === "stage") tw.yaw = act.spot.yaw + Math.sin(now * 1.4 + tw.phase) * 0.4; // play to the crowd
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

  private stepPerform(tw: SimTwin, now: number): void {
    if (now < tw.perform!.until) return;
    this.stopPerform(tw, now);
  }

  private stepIdle(tw: SimTwin, now: number): void {
    if (!this.ambient || tw.order || tw.heldUntil > now || now < tw.nextWanderAt) return;
    // stay around the venue the AI last sent this twin to
    const home = nearestZone({ x: tw.ax, z: tw.az });
    const free = this.spots.filter((s) => s.busyBy === null && s.zone === home);
    if (this.random() < 0.5 && free.length > 0) {
      // do something at this venue (sit, sip, perform)
      const spot = free[Math.floor(this.random() * free.length)];
      spot.busyBy = tw.id;
      this.walkTo(tw, { x: spot.x, z: spot.z }, spot);
    } else {
      this.walkTo(tw, {
        x: clamp(tw.ax + (this.random() - 0.5) * 2 * LOITER, -ROAM, ROAM),
        z: clamp(tw.az + (this.random() - 0.5) * 2 * LOITER, -ROAM, ROAM)
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
        const lines = AMBIENT_DIALOGS[Math.floor(this.random() * AMBIENT_DIALOGS.length)];
        const mine = lines.map((_, k) => k % 2 === 0);
        a.talk = { partnerId: b.id, lines, mine, idx: -1, nextAt: now + 0.3 };
        b.talk = { partnerId: a.id, lines, mine: mine.map((v) => !v), idx: -1, nextAt: Infinity };
        a.mode = "talk";
        b.mode = "talk";
        this.setAnim(a, "talk", now);
        this.setAnim(b, "talk", now);
        a.yaw = Math.atan2(b.x - a.x, b.z - a.z);
        b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
      }
    }
  }

  // ---------------- helpers ----------------

  private create(v: WorldTwinView, now: number): SimTwin {
    const p = tileToWorld(v.col, v.row);
    // a saved pose puts the twin back exactly where the player left it
    const at = v.pose ?? { x: p.x, z: p.z, yaw: 0 };
    return {
      id: v.id, name: v.name, colorHex: v.colorHex,
      x: at.x, z: at.z, yaw: at.yaw, bubble: null, status: null,
      anim: "idle", animStart: now, perform: null,
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
    tw.anim = "idle";
  }

  private setAnim(tw: SimTwin, anim: BodyAnim, now: number): void {
    if (tw.anim === anim) return;
    tw.anim = anim;
    tw.animStart = now;
  }

  private stopPerform(tw: SimTwin, now: number): void {
    if (!tw.perform) return;
    const partner = tw.perform.partnerId ? this.twins.get(tw.perform.partnerId) : undefined;
    tw.perform = null;
    tw.mode = "idle";
    tw.bubble = null;
    this.setAnim(tw, "idle", now);
    tw.nextWanderAt = now + 2 + this.random() * 3;
    if (partner?.perform?.partnerId === tw.id) {
      partner.perform = null;
      partner.mode = "idle";
      partner.bubble = null;
      this.setAnim(partner, "idle", now);
      partner.heldUntil = Math.min(partner.heldUntil, now + 2);
    }
  }

  private stopActivity(tw: SimTwin): void {
    if (tw.activity) {
      if (tw.activity.spot.busyBy === tw.id) tw.activity.spot.busyBy = null;
      tw.activity = null;
    }
    if (tw.onArrive && tw.onArrive.busyBy === tw.id) tw.onArrive.busyBy = null;
    tw.bubble = null;
    if (tw.anim !== "idle") tw.anim = "idle";
  }

  private stopTalk(tw: SimTwin): void {
    if (!tw.talk) return;
    const partner = this.twins.get(tw.talk.partnerId);
    tw.talk = null;
    tw.mode = "idle";
    tw.bubble = null;
    tw.anim = "idle";
    if (partner?.talk?.partnerId === tw.id) {
      partner.talk = null;
      partner.mode = "idle";
      partner.bubble = null;
      partner.anim = "idle";
    }
  }
}
