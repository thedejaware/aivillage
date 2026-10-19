/**
 * VillageSim — the twins' bodies. Pure TypeScript (no three.js): the renderer
 * reads each twin's transform + pose every frame, and tests drive it directly.
 *
 * Ambient life at zero LLM cost, around the place the AI sent each twin:
 *  - twins walk the road network (no straight-line cutting)
 *  - restful spots only (café seats, benches, the lawn blanket, sun loungers)
 *  - wordless emoji chats when idle twins bump into each other
 * WHERE a twin goes is decided by its AI (server frames), not by random strolls.
 *
 * Place actions (Main Street): an act order whose action has a place walks the
 * twin to a FREE spot of the right kind and plays the activity there — a lane
 * in the pool, a gym station, a cinema seat, a bike from the rack, the
 * rollercoaster queue, the house door (then the twin is hidden while it sleeps).
 * A full place makes the twin wait nearby; nobody stacks on one spot.
 */
import {
  orderStatus, DEFAULT_ZONES, LAYOUT_VERSION,
  type ActionItem, type BodyAnim, type PerformedAction, type TwinPose, type WorldState, type WorldTwinView
} from "@aivillage/shared";
import {
  findRoute, tileToWorld, zoneCenter, SPOTS, ISLAND_HALF, NODES, EDGES, POOL, BIKE_ROUTE, COASTER_EXITS,
  COASTER_DROP, COASTER_QUEUE, COASTER_RIDE_SECONDS, COASTER_SEATS, coasterPose,
  type Pt, type SpotDef, type ActivityKind
} from "./layout";
import { PAD_RADIUS, SEAT_Y } from "../../components/village/scenery";

/** Walking speed, world units per second. */
export const WALK_SPEED = 0.85;
/** Cycling speed along the bike lane. */
export const BIKE_SPEED = 2.2;
/** Swimming speed along a lane. */
export const SWIM_SPEED = 0.45;
/** Seat top the avatar's seated anims are built for (hips at 0.31, thighs on a ~0.25 seat). */
export const AVATAR_SEAT = 0.25;
/** Seat top above the coaster track's centre line (the 3D cart should match). */
export const CART_SEAT_HEIGHT = 0.16;
/** The cart leaves once its first rider has waited this long (so a friend can catch up). */
const BOARD_WAIT_S = 2;
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
/** A waiting twin looks for a free spot this often. */
const RETRY_S = 1;
/** After an activity the twin steps this far off its seat / out of the water. */
const STEP_OFF = 0.45;
const ROAM = ISLAND_HALF - 0.8;

const ACTIVITY_EMOJI: Record<ActivityKind, string[]> = {
  coffee: ["☕", "😋", "☕"],
  bench: ["💭", "😌", "📖"],
  blanket: ["🌸", "🎶", "😊"],
  stage: ["🎤", "✨", "💃"],
  bed: ["💤"],
  treadmill: ["🏃", "💦", "💪"],
  weights: ["💪", "🏋️", "💦"],
  swim: ["🏊", "💦"],
  lounger: ["😎", "☀️", "😌"],
  cinema: ["🍿", "😂", "😮"],
  plot: ["🥕", "🌱", "🧺"],
  coaster: ["🎢"],
  bike: ["🚲"]
};
/** Ambient (idle-life) visit lengths. */
const ACTIVITY_DURATION: Record<ActivityKind, [number, number]> = {
  coffee: [10, 18], bench: [9, 16], blanket: [10, 18], stage: [6, 11], bed: [20, 30],
  treadmill: [10, 16], weights: [10, 16], swim: [12, 20], lounger: [10, 18], cinema: [15, 25],
  plot: [10, 16], coaster: [10, 16], bike: [10, 16]
};
/** The body animation for each kind of spot. */
const ACTIVITY_ANIM: Record<ActivityKind, BodyAnim> = {
  coffee: "drink", bench: "sit", blanket: "sit", stage: "dance", bed: "sleep", treadmill: "run",
  weights: "lift", swim: "swim", lounger: "sit", cinema: "watch", plot: "dig", coaster: "ride", bike: "bike"
};
/** Spots free-roaming twins use by themselves (rest, never exercise). */
const RESTFUL_KINDS = new Set<ActivityKind>(["coffee", "bench", "blanket", "lounger"]);
/** Spots a plain "go to X" order sits the twin at. */
const GO_KINDS = new Set<ActivityKind>(["coffee", "bench", "blanket", "lounger", "cinema", "stage"]);
/** Seats: the avatar's legs sit (hips on the seat top) whatever the upper body plays. */
const SEAT_KINDS = new Set<ActivityKind>(["coffee", "bench", "cinema", "lounger", "blanket"]);
/** Anims that sit down (hips at seat height). */
const SEATED_ANIMS = new Set<BodyAnim>(["sit", "watch", "ride"]);
/** The avatar's "sit" on bare ground drops the body by this. */
const GROUND_SIT_DROP = 0.22;

/** Which spot a catalogue action uses. */
const ACTION_KIND: Record<string, ActivityKind> = {
  swim: "swim", sunbathe: "lounger", run: "treadmill", work_out: "weights", watch_movie: "cinema",
  garden: "plot", drink_coffee: "coffee", drink_juice: "coffee", eat: "coffee", read: "bench",
  ride_bike: "bike", ride_coaster: "coaster", sleep: "bed", sing: "stage"
};
/** "sit" sent by the AI to a place: where it sits there. */
const SIT_KIND: Record<string, ActivityKind> = {
  event_space: "blanket", network_hub: "bench", maker_space: "coffee", pool: "lounger", cinema: "cinema"
};
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

export type Mode = "idle" | "walk" | "activity" | "talk" | "perform" | "task";
export interface SpotState extends SpotDef { busyBy: string | null; }
type Order = WorldTwinView["order"];

/**
 * A place activity in progress.
 *  wait  — the place is full; standing nearby, looking for a free spot
 *  go    — walking to the claimed spot
 *  queue — in the rollercoaster queue
 *  ride  — in the coaster cart
 *  do    — seated / standing activity at the spot
 *  swim  — lengths along a pool lane
 *  bike  — riding the bike route; park — riding back into the rack
 *  sleep — inside the house (hidden)
 */
export type TaskPhase = "wait" | "go" | "queue" | "ride" | "do" | "swim" | "bike" | "park" | "sleep";

export interface PlaceTask {
  action: PerformedAction;
  zone: string;
  kind: ActivityKind;
  spot: SpotState | null;
  phase: TaskPhase;
  /** when the activity ends (set when it starts) */
  until: number;
  /** waiting: when to look for a spot again */
  retryAt: number;
  /** pulled along by someone else's order ("take Sena to the cinema") */
  guest: boolean;
  partnerId: string | null;
  emojiAt: number;
  emojiUntil: number;
  /** swim: +1 toward the deck, −1 toward the far end */
  dir: number;
  /** bike: next waypoint, path position, sideways lane offset, turned back early */
  idx: number;
  px: number;
  pz: number;
  lane: number;
  turned: boolean;
  /** coaster: arrival in the queue, seat in the cart, seat height */
  queuedAt: number;
  seat: number;
  rideY: number;
}

export interface SimTwin {
  id: string;
  name: string;
  colorHex: number;
  // ---- what the renderer reads ----
  x: number;
  z: number;
  /** facing (three.js Y rotation; 0 = +z) */
  yaw: number;
  /** nose-up tilt (coaster riders), radians */
  pitch: number;
  /** inside the house asleep — the renderer hides the avatar and its badge */
  hidden: boolean;
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
  task: PlaceTask | null;
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
  onOrderArrive?: (twinId: string, status: string, issuedAt: string | null) => void;
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
const inDrop = (t: number) => t >= COASTER_DROP[0] && t <= COASTER_DROP[1];

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

/** The street node each place's branch road joins (so waiting twins stand toward the street). */
const STREET_OF: Record<string, Pt> = (() => {
  const out: Record<string, Pt> = {};
  for (const z of DEFAULT_ZONES) {
    const c = zoneCenter(z.name);
    const node = Object.entries(NODES).find(([, p]) => Math.hypot(p.x - c.x, p.z - c.z) < 1e-6)?.[0];
    const edge = node ? EDGES.find(([a, b]) => a === node || b === node) : undefined;
    const other = edge ? (edge[0] === node ? edge[1] : edge[0]) : "S7";
    out[z.name] = NODES[other];
  }
  return out;
})();

/** A point on a place's pad toward its street — where a twin waits for a free spot. */
function waitPoint(zone: string, id: string): Pt {
  const c = zoneCenter(zone);
  const s = STREET_OF[zone] ?? c;
  const d = Math.hypot(s.x - c.x, s.z - c.z) || 1;
  const r = Math.min(d, (PAD_RADIUS[zone] ?? 1.2) - 0.2);
  const ux = (s.x - c.x) / d, uz = (s.z - c.z) / d;
  const side = ((hash(id) % 5) - 2) * 0.22;
  return { x: c.x + ux * r - uz * side, z: c.z + uz * r + ux * side };
}

/** The spot kind a place action uses, or null (then it plays near the venue, as before). */
function taskKindFor(action: PerformedAction, order: NonNullable<Order>): { zone: string; kind: ActivityKind } | null {
  if (action.refused) return null;
  const kind = ACTION_KIND[action.id];
  if (kind && action.place) return { zone: action.place, kind };
  // the AI sending a twin to "sit" somewhere: sit on that place's seats
  if (action.id === "sit" && order.auto && SIT_KIND[order.zone]) return { zone: order.zone, kind: SIT_KIND[order.zone] };
  return null;
}

/** Vertical body offset: seats, the stage, the water, the coaster cart, sitting on the grass. */
export function bodyLift(tw: SimTwin): number {
  const task = tw.task;
  if (task?.phase === "ride") return task.rideY - AVATAR_SEAT;
  if (task?.phase === "swim") return SEAT_Y.swim;
  const kind = spotKind(tw);
  if (kind) {
    if (SEAT_KINDS.has(kind)) return SEAT_Y[kind] - AVATAR_SEAT;
    if (SEATED_ANIMS.has(tw.anim)) return SEAT_Y[kind] - AVATAR_SEAT;
    return SEAT_Y[kind];
  }
  return tw.anim === "sit" && tw.route.length === 0 ? -GROUND_SIT_DROP : 0;
}

/** The spot kind the twin is at right now (an ambient visit or a place activity). */
function spotKind(tw: SimTwin): ActivityKind | null {
  return tw.activity?.spot.kind ?? (tw.task?.phase === "do" ? tw.task.kind : null);
}

/** Legs sit (seat, blanket, coaster cart); the upper body still plays the anim. */
export function isSeated(tw: SimTwin): boolean {
  if (tw.route.length > 0) return false;
  if (tw.task?.phase === "ride") return true;
  const kind = spotKind(tw);
  return kind !== null && SEAT_KINDS.has(kind);
}

/** True while the twin sits in the moving coaster cart. */
export function isRiding(tw: SimTwin): boolean {
  return tw.task?.phase === "ride";
}

/** What the avatar renderer needs each frame. */
export function avatarPose(tw: SimTwin, now: number) {
  const t = tw.task;
  const doing = t !== null && t.phase !== "wait" && t.phase !== "go" && t.phase !== "queue";
  const item: ActionItem | null = doing ? t.action.item ?? null : tw.perform ? tw.order?.action?.item ?? null : null;
  return {
    anim: tw.anim,
    animTime: Math.max(0, now - tw.animStart),
    walking: tw.route.length > 0,
    walkPhase: tw.walkPhase,
    speed: tw.speedMul,
    seated: isSeated(tw),
    item
  };
}

export class VillageSim {
  readonly twins = new Map<string, SimTwin>();
  readonly spots: SpotState[] = SPOTS.map((s) => ({ ...s, busyBy: null }));
  /** the rollercoaster cart: track fraction, whether it moves, who sits in it (seat order) */
  readonly coaster: { t: number; running: boolean; riders: string[] } = { t: 0, running: false, riders: [] };
  /** twin whose line is on the TV caption bar — it doesn't start side chats */
  speakingId: string | null = null;
  /** sim time of the last step (seconds) — the renderer's clock for animTime */
  now = 0;
  private readonly random: () => number;
  private readonly ambient: boolean;
  private readonly onOrderArrive?: (twinId: string, status: string, issuedAt: string | null) => void;
  private readonly pairCooldown = new Map<string, number>();
  private nextTalkScan = 0;
  private coasterStart = 0;

  constructor(opts: SimOptions = {}) {
    this.random = opts.random ?? Math.random;
    this.ambient = opts.ambient ?? true;
    this.onOrderArrive = opts.onOrderArrive;
  }

  /** Bikes out of the rack right now (the renderer hides that many). */
  bikesInUse(): number {
    let n = 0;
    for (const tw of this.twins.values()) if (tw.task?.kind === "bike" && (tw.task.phase === "bike" || tw.task.phase === "park")) n++;
    return n;
  }

  /** Twins asleep inside the house. */
  sleepingCount(): number {
    let n = 0;
    for (const tw of this.twins.values()) if (tw.hidden) n++;
    return n;
  }

  // ---------------- server → sim ----------------

  /** Apply a server world snapshot: add/remove twins, new tile targets, owner orders. */
  reconcile(state: WorldState, now: number): void {
    const seen = new Set<string>();
    // everyone first: an order may name a partner listed later in the snapshot
    for (const v of state.twins) {
      let tw = this.twins.get(v.id);
      if (!tw) {
        tw = this.create(v, now);
        this.twins.set(v.id, tw);
      }
      tw.name = v.name;
      tw.colorHex = v.colorHex;
    }
    for (const v of state.twins) {
      seen.add(v.id);
      const tw = this.twins.get(v.id)!;
      const { x: nx, z: nz } = tileToWorld(v.col, v.row);
      const key = orderKeyOf(v.order);
      if (key !== tw.orderKey) {
        tw.orderKey = key;
        tw.order = v.order;
        this.startOrder(tw, now);
      }
      if (tw.order && tw.order.kind !== "talk_to") {
        // held by its order — server tile updates don't drag it around
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
      this.stopTask(tw, now);
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
    this.stopTask(tw, now);
    this.stopActivity(tw);
    this.stopTalk(tw);
    spot.busyBy = tw.id;
    tw.x = spot.x;
    tw.z = spot.z;
    tw.route = [];
    this.beginActivity(tw, spot, now);
  }

  /** Where everyone is now — saved so the village resumes exactly here (on this map). */
  poses(): (TwinPose & { id: string })[] {
    return [...this.twins.values()].map((tw) => {
      // a rider is saved at the queue, a sleeper at the door: never mid-air
      const p = tw.task?.phase === "ride" ? COASTER_QUEUE[tw.task.seat % COASTER_QUEUE.length] : tw;
      return { id: tw.id, x: p.x, z: p.z, yaw: tw.yaw, zone: nearestZone(p), layout: LAYOUT_VERSION };
    });
  }

  // ---------------- per-frame ----------------

  step(now: number, dt: number): void {
    this.now = now;
    if (this.ambient && now >= this.nextTalkScan) {
      this.nextTalkScan = now + 2;
      this.matchmake(now);
    }
    this.stepCoaster(now);
    for (const tw of this.twins.values()) {
      // a server move waits until a place activity (e.g. as someone's guest) is over
      if (tw.applyAt > 0 && now >= tw.applyAt && !tw.task) {
        tw.applyAt = 0;
        tw.ax = tw.nextTx;
        tw.az = tw.nextTz;
        this.stopActivity(tw);
        this.stopTalk(tw);
        this.walkTo(tw, { x: tw.nextTx, z: tw.nextTz }, null);
        tw.nextWanderAt = now + 4 + this.random() * 5;
      }

      if (tw.route.length > 0) this.stepWalk(tw, now, dt);
      else if (tw.mode === "task" && tw.task) this.stepTask(tw, now, dt);
      else if (tw.mode === "activity" && tw.activity) this.stepActivity(tw, now);
      else if (tw.mode === "talk" && tw.talk) this.stepTalk(tw, now);
      else if (tw.mode === "perform" && tw.perform) this.stepPerform(tw, now);
      else this.stepIdle(tw, now);
    }
  }

  // ---------------- owner orders ----------------

  private startOrder(tw: SimTwin, now: number): void {
    this.stopTask(tw, now);
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
    const seats = this.spots.filter((s) => s.zone === order.zone && GO_KINDS.has(s.kind));
    const spot = seats.find((s) => s.busyBy === null || s.busyBy === tw.id) ??
      seats.find((s) => !this.twins.get(s.busyBy ?? "")?.order && !this.twins.get(s.busyBy ?? "")?.task);
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
      this.walkTo(tw, waitPoint(order.zone, tw.id), null);
    }
  }

  /** Act order: a place activity, or go to the partner / the venue (if needed), then perform. */
  private startAct(tw: SimTwin, now: number): void {
    const action = tw.order?.action;
    const fit = action && tw.order ? taskKindFor(action, tw.order) : null;
    if (action && fit) {
      this.startTask(tw, action, fit.zone, fit.kind, now, false);
      return;
    }
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
    target.heldUntil = now + HOLD_FOR_VISITOR_S;
    if (target.task) return; // busy at a place: the visitor comes to it
    this.stopTalk(target);
    if (target.mode === "walk") {
      target.route = [];
      target.onArrive = null;
      target.mode = "idle";
    }
    target.applyAt = 0;
  }

  /** Play the ordered action (with the partner, if any). */
  private perform(tw: SimTwin, now: number): void {
    const action = tw.order?.action;
    if (!action) return;
    const partner = action.targetName ? this.byName(action.targetName) : undefined;
    if (partner && partner !== tw) {
      this.stopTask(partner, now);
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
    if (tw.order.kind === "act" && !tw.task) this.perform(tw, now);
    tw.status = orderStatus(tw.order, true);
    this.onOrderArrive?.(tw.id, tw.status, tw.order.issuedAt ?? null);
  }

  // ---------------- place activities ----------------

  private startTask(tw: SimTwin, action: PerformedAction, zone: string, kind: ActivityKind, now: number, guest: boolean): void {
    const partner = action.targetName ? this.byName(action.targetName) : undefined;
    const withPartner = partner && partner !== tw ? partner : undefined;
    tw.task = {
      action, zone, kind, spot: null, phase: "wait", until: 0, retryAt: 0, guest,
      partnerId: withPartner?.id ?? null, emojiAt: 0, emojiUntil: 0, dir: -1,
      idx: 0, px: tw.x, pz: tw.z, lane: 0, turned: false, queuedAt: 0, seat: 0, rideY: 0
    };
    tw.hidden = false;
    // bring the partner along unless its owner has it busy
    if (!guest && withPartner && !withPartner.order) {
      this.stopTask(withPartner, now);
      this.stopActivity(withPartner);
      this.stopTalk(withPartner);
      this.stopPerform(withPartner, now);
      withPartner.applyAt = 0;
      this.startTask(withPartner, { ...action, targetName: tw.name }, zone, kind, now, true);
    }
    this.claimOrWait(tw, now);
  }

  /** Claim a free spot and walk there, or walk to the waiting point. */
  private claimOrWait(tw: SimTwin, now: number): void {
    const task = tw.task!;
    const spot = this.freeSpotFor(tw);
    if (spot) {
      if (task.kind !== "bed") spot.busyBy = tw.id;
      task.spot = spot;
      task.phase = "go";
      tw.bubble = null;
      this.walkTo(tw, { x: spot.x, z: spot.z }, null);
      if (tw.route.length === 0) this.arriveTask(tw, now);
      return;
    }
    task.phase = "wait";
    task.retryAt = now + RETRY_S;
    const w = waitPoint(task.zone, tw.id);
    if (Math.hypot(w.x - tw.x, w.z - tw.z) > 0.6) this.walkTo(tw, w, null);
    else {
      tw.route = [];
      tw.mode = "task";
    }
    tw.bubble = "⏳";
  }

  /** A free spot of the task's kind — next to the partner's when doing it together. */
  private freeSpotFor(tw: SimTwin): SpotState | null {
    const task = tw.task!;
    const all = this.spots.filter((s) => s.zone === task.zone && s.kind === task.kind);
    if (task.kind === "bed") return all[0] ?? null; // the house sleeps everyone
    const free = all.filter((s) => s.busyBy === null);
    if (free.length === 0) return null;
    const partner = task.partnerId ? this.twins.get(task.partnerId) : undefined;
    const theirs = partner?.task?.zone === task.zone ? partner.task.spot : null;
    if (theirs) {
      // café: the opposite seat at the same table; elsewhere the neighbouring spot
      const i = all.indexOf(theirs);
      const near = [...free].sort((a, b) => this.pairRank(theirs, a, all.indexOf(a), i) - this.pairRank(theirs, b, all.indexOf(b), i));
      return near[0];
    }
    if (partner && task.kind !== "coaster") {
      // pick the first spot whose neighbour is free too, so the partner sits beside us
      for (const s of free) {
        const mate = this.mateOf(s, all);
        if (mate && mate.busyBy === null) return s;
      }
    }
    return free[0];
  }

  private mateOf(s: SpotState, all: SpotState[]): SpotState | undefined {
    if (s.kind === "coffee") return all.find((o) => o !== s && o.id.slice(0, -1) === s.id.slice(0, -1));
    const i = all.indexOf(s);
    return all[i % 2 === 0 ? i + 1 : i - 1];
  }

  private pairRank(theirs: SpotState, s: SpotState, i: number, j: number): number {
    if (s.kind === "coffee") return s.id.slice(0, -1) === theirs.id.slice(0, -1) ? 0 : 10 + Math.hypot(s.x - theirs.x, s.z - theirs.z);
    return Math.abs(i - j) + Math.hypot(s.x - theirs.x, s.z - theirs.z) * 0.01;
  }

  /** Reached the claimed spot: start the activity. */
  private arriveTask(tw: SimTwin, now: number): void {
    const task = tw.task!;
    const spot = task.spot!;
    const action = task.action;
    tw.mode = "task";
    tw.walkPhase = 0;
    tw.x = spot.x;
    tw.z = spot.z;
    tw.yaw = spot.yaw;
    tw.bubble = null;
    task.until = now + action.seconds;
    switch (task.kind) {
      case "coaster":
        task.phase = "queue";
        task.queuedAt = now;
        this.setAnim(tw, "idle", now);
        break;
      case "bed":
        task.phase = "sleep";
        // owner orders keep the twin asleep until the order ends
        task.until = tw.order && !task.guest ? Infinity : now + action.seconds;
        tw.hidden = true;
        this.setAnim(tw, "sleep", now);
        break;
      case "bike":
        task.phase = "bike";
        task.idx = 0;
        task.turned = false;
        task.px = tw.x;
        task.pz = tw.z;
        task.lane = (this.spots.filter((s) => s.kind === "bike").indexOf(spot) - 1.5) * 0.12;
        this.setAnim(tw, "bike", now);
        break;
      case "swim":
        task.phase = "swim";
        task.dir = -1;
        this.setAnim(tw, "swim", now);
        break;
      default: {
        task.phase = "do";
        this.setAnim(tw, action.anim, now);
        tw.bubble = action.emoji;
        task.emojiUntil = now + 2;
        task.emojiAt = now + 4 + this.random() * 3;
        // (café seats a/b of one table face each other, so a pair sits face to face)
      }
    }
    if (!task.guest) this.arriveOrder(tw, now);
  }

  private stepTask(tw: SimTwin, now: number, dt: number): void {
    const task = tw.task!;
    switch (task.phase) {
      case "wait":
        if (now >= task.retryAt) this.claimOrWait(tw, now);
        return;
      case "go":
        // the walk ended without reaching the spot (should not happen): retry
        this.claimOrWait(tw, now);
        return;
      case "queue":
      case "ride":
        return; // the cart drives these (stepCoaster)
      case "sleep":
        if (now >= task.until) this.finishTask(tw, now, false);
        return;
      case "swim":
        this.stepSwim(tw, now, dt);
        return;
      case "bike":
      case "park":
        this.stepBike(tw, now, dt);
        return;
      case "do":
        this.emojiTick(tw, task, now);
        if (now >= task.until) this.finishTask(tw, now, true);
        return;
    }
  }

  private emojiTick(tw: SimTwin, e: { emojiAt: number; emojiUntil: number }, now: number, kind?: ActivityKind): void {
    if (now >= e.emojiAt) {
      const pool = ACTIVITY_EMOJI[kind ?? tw.task?.kind ?? "bench"];
      tw.bubble = pool[Math.floor(this.random() * pool.length)];
      e.emojiUntil = now + 1.8;
      e.emojiAt = now + 4 + this.random() * 4;
    } else if (e.emojiUntil > 0 && now >= e.emojiUntil) {
      tw.bubble = null;
      e.emojiUntil = 0;
    }
  }

  private stepSwim(tw: SimTwin, now: number, dt: number): void {
    const task = tw.task!;
    const c = zoneCenter(task.zone);
    // dir +1 = toward the deck end (`swimFrom`), −1 = toward the far end (`swimTo`)
    const near = c.z + POOL.swimFrom;
    const far = c.z + POOL.swimTo;
    const sgn = Math.sign(near - far) || 1;
    const done = now >= task.until;
    if (done) task.dir = 1; // last length: back to the deck end
    tw.z += task.dir * sgn * SWIM_SPEED * dt;
    if ((tw.z - far) * sgn <= 0) { tw.z = far; task.dir = 1; }
    if ((tw.z - near) * sgn >= 0) {
      tw.z = near;
      if (done) { this.finishTask(tw, now, true); return; }
      task.dir = -1;
    }
    tw.yaw = task.dir * sgn > 0 ? 0 : Math.PI;
  }

  private stepBike(tw: SimTwin, now: number, dt: number): void {
    const task = tw.task!;
    const n = BIKE_ROUTE.length;
    // time's up on the way out: turn round (the route goes out and back the same way)
    if (task.phase === "bike" && now >= task.until && !task.turned && task.idx > 0 && task.idx < n / 2) {
      const back = n - task.idx;
      const a = BIKE_ROUTE[back], b = BIKE_ROUTE[task.idx - 1];
      if (back < n && Math.hypot(a.x - b.x, a.z - b.z) < 1e-6) task.idx = back;
      task.turned = true;
    }
    const target = task.phase === "park" ? task.spot! : BIKE_ROUTE[task.idx];
    const speed = task.phase === "park" ? BIKE_SPEED * 0.4 : BIKE_SPEED;
    const dx = target.x - task.px;
    const dz = target.z - task.pz;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d > step) {
      task.px += (dx / d) * step;
      task.pz += (dz / d) * step;
      let dy = Math.atan2(dx, dz) - tw.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      tw.yaw += dy * Math.min(1, dt * 6);
    } else {
      task.px = target.x;
      task.pz = target.z;
      if (task.phase === "park") {
        tw.x = task.px;
        tw.z = task.pz;
        tw.yaw = task.spot!.yaw;
        this.finishTask(tw, now, true);
        return;
      }
      task.idx += 1;
      if (task.idx >= n) {
        if (now < task.until) {
          task.idx = 1; // another lap
          task.turned = false;
        } else task.phase = "park";
      }
    }
    // keep to our side of the lane so two riders don't merge into one
    const lane = task.phase === "park" ? 0 : task.lane;
    tw.x = task.px + Math.cos(tw.yaw) * lane;
    tw.z = task.pz - Math.sin(tw.yaw) * lane;
  }

  /** Board, move and unload the rollercoaster cart. */
  private stepCoaster(now: number): void {
    const c = this.coaster;
    if (c.running) {
      c.t = Math.min(1, (now - this.coasterStart) / COASTER_RIDE_SECONDS);
      c.riders = c.riders.filter((id) => this.twins.get(id)?.task?.phase === "ride");
      c.riders.forEach((id) => this.placeRider(this.twins.get(id)!, now));
      if (c.t >= 1) {
        c.riders.forEach((id, i) => this.unloadRider(this.twins.get(id)!, i, now));
        c.riders = [];
        c.running = false;
        c.t = 0;
      }
      return;
    }
    const waiting = [...this.twins.values()]
      .filter((tw) => tw.task?.phase === "queue")
      .sort((a, b) => a.task!.queuedAt - b.task!.queuedAt);
    if (waiting.length === 0) return;
    if (waiting.length < COASTER_SEATS.length && now - waiting[0].task!.queuedAt < BOARD_WAIT_S) return;
    const group = waiting.slice(0, COASTER_SEATS.length);
    c.running = true;
    c.t = 0;
    this.coasterStart = now;
    c.riders = group.map((tw) => tw.id);
    group.forEach((tw, i) => {
      const task = tw.task!;
      if (task.spot && task.spot.busyBy === tw.id) task.spot.busyBy = null;
      task.spot = null;
      task.phase = "ride";
      task.seat = i;
      task.until = now + COASTER_RIDE_SECONDS;
      tw.route = [];
      this.setAnim(tw, "ride", now);
      this.placeRider(tw, now);
    });
  }

  private placeRider(tw: SimTwin, now: number): void {
    const task = tw.task!;
    const p = coasterPose(this.coaster.t);
    const s = COASTER_SEATS[task.seat] ?? COASTER_SEATS[0];
    const along = s.z * Math.cos(p.pitch);
    tw.x = p.x + s.x * Math.cos(p.yaw) + along * Math.sin(p.yaw);
    tw.z = p.z - s.x * Math.sin(p.yaw) + along * Math.cos(p.yaw);
    task.rideY = p.y + s.z * Math.sin(p.pitch) + CART_SEAT_HEIGHT;
    tw.yaw = p.yaw;
    tw.pitch = p.pitch;
    const drop = inDrop(this.coaster.t);
    this.setAnim(tw, drop ? "cheer" : "ride", now);
    tw.bubble = drop ? "😱" : null;
  }

  private unloadRider(tw: SimTwin, i: number, now: number): void {
    const exit = COASTER_EXITS[i % COASTER_EXITS.length];
    tw.x = exit.x;
    tw.z = exit.z;
    tw.yaw = 0;
    this.finishTask(tw, now, false);
    tw.bubble = "🤩";
    tw.heldUntil = now + 2;
  }

  /** The activity is over: free the spot, stand up / climb out, wait for what's next. */
  private finishTask(tw: SimTwin, now: number, stepOff: boolean): void {
    const task = tw.task;
    if (!task) return;
    const from = task.spot ?? { x: tw.x, z: tw.z };
    this.releaseTask(tw);
    tw.mode = "idle";
    tw.bubble = null;
    this.setAnim(tw, "idle", now);
    tw.nextWanderAt = now + 2 + this.random() * 3;
    if (stepOff) {
      const w = waitPoint(task.zone, tw.id);
      const d = Math.hypot(w.x - from.x, w.z - from.z);
      if (d > 0.05) {
        const k = Math.min(1, STEP_OFF / d);
        tw.route = [{ x: tw.x + (w.x - tw.x) * k, z: tw.z + (w.z - tw.z) * k }];
        tw.mode = "walk";
      }
    }
    if (tw.applyAt > 0) tw.applyAt = Math.max(tw.applyAt, now + 0.5);
  }

  /** Drop a place activity (order changed, twin removed): free everything it held. */
  private stopTask(tw: SimTwin, now: number): void {
    const task = tw.task;
    if (!task) return;
    const guest = !task.guest && task.partnerId ? this.twins.get(task.partnerId) : undefined;
    if (task.phase === "ride") {
      // jump off at the station rather than float above the track
      this.coaster.riders = this.coaster.riders.filter((id) => id !== tw.id);
      const gate = NODES.FUN;
      tw.x = gate.x;
      tw.z = gate.z + 0.45;
    } else if (task.phase === "bike" || task.phase === "park") {
      tw.x = task.px;
      tw.z = task.pz;
    }
    this.releaseTask(tw);
    tw.route = [];
    tw.onArrive = null;
    tw.mode = "idle";
    tw.bubble = null;
    if (tw.anim !== "idle") this.setAnim(tw, "idle", now);
    // the friend we brought along goes back to its own life
    if (guest?.task?.guest && guest.task.partnerId === tw.id) this.stopTask(guest, now);
  }

  private releaseTask(tw: SimTwin): void {
    const task = tw.task;
    if (!task) return;
    if (task.spot && task.spot.busyBy === tw.id) task.spot.busyBy = null;
    tw.task = null;
    tw.hidden = false;
    tw.pitch = 0;
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
    if (tw.task) {
      if (tw.task.phase === "go") this.arriveTask(tw, now);
      else tw.mode = "task"; // at the waiting point
      return;
    }
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
    this.emojiTick(tw, act, now, k);
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
    if (tw.bubble && tw.mode === "idle") tw.bubble = null;
    // stay around the venue the AI last sent this twin to; rest there, never exercise
    const home = nearestZone({ x: tw.ax, z: tw.az });
    const free = this.spots.filter((s) => s.busyBy === null && s.zone === home && RESTFUL_KINDS.has(s.kind));
    if (this.random() < 0.5 && free.length > 0) {
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
      (tw) => tw.mode === "idle" && !tw.activity && !tw.task && !tw.order && tw.heldUntil <= now && this.speakingId !== tw.id && !tw.talk
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
    // a pose saved on THIS map puts the twin back exactly where the player left it
    const at = v.pose && v.pose.layout === LAYOUT_VERSION ? v.pose : { x: p.x, z: p.z, yaw: 0 };
    return {
      id: v.id, name: v.name, colorHex: v.colorHex,
      x: at.x, z: at.z, yaw: at.yaw, pitch: 0, hidden: false, bubble: null, status: null,
      anim: "idle", animStart: now, perform: null,
      mode: "idle", route: [], onArrive: null, activity: null, task: null, talk: null,
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
