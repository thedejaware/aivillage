/**
 * Pure pose math for the chibi avatar: every body animation is a function of
 * time that writes joint angles into a flat `Rig`. No three.js here, so it is
 * cheap and unit-testable. Avatar.tsx maps the semantic values onto groups.
 *
 * Semantic sign conventions (both sides use the same meaning; Avatar mirrors):
 *  - shoulder f: raise forward (π = straight up), o: out to the side, t: twist
 *  - elbow e: bend (hand comes forward/up), ez: forearm swings out (+) / in (−)
 *  - wrist w: flex forward
 *  - thigh f: forward, o: out to the side; knee k: bend backward
 *  - spine/head x: lean/nod forward, y: turn to the character's left, z: tilt to its right
 */
import type { ActionItem, BodyAnim } from "@aivillage/shared";
import type { AvatarPose } from "./types";

export const RIG_KEYS = [
  "y", "z", "g", "bx", "by", "bz",
  "sx", "sy", "sz",
  "hx", "hy", "hz",
  "lsf", "lso", "lst", "le", "lez", "lw",
  "rsf", "rso", "rst", "re", "rez", "rw",
  "ltf", "lto", "lk",
  "rtf", "rto", "rk"
] as const;
export type RigKey = (typeof RIG_KEYS)[number];
export type Rig = Record<RigKey, number>;

/** Skeleton lengths (world units at scale 1). */
export const LIMB = { thigh: 0.14, shin: 0.13, hipDrop: 0.02, restHip: 0.31 } as const;

export type EyeState = "base" | "closed" | "happy" | "cry";
export type MouthState = "base" | "open" | "o" | "pucker" | "frown" | "flat";
export type PropId =
  | "cup" | "book" | "phone" | "broom" | "can" | "food" | "bubbles" | "finger" | "zzz"
  // held items (AvatarPose.item) + the bike the avatar draws under itself
  | ActionItem | "bike";

export interface FaceState { eyes: EyeState; mouth: MouthState }

const TAU = Math.PI * 2;
const osc = (t: number, hz: number, phase = 0) => Math.sin((t * hz + phase) * TAU);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** 0→1 over [a, a+fade], 1 until b-fade, then back to 0 at b. */
const window_ = (t: number, a: number, b: number, fade: number) =>
  smooth((t - a) / fade) * (1 - smooth((t - (b - fade)) / fade));

export function restRig(out: Rig = {} as Rig): Rig {
  for (const k of RIG_KEYS) out[k] = 0;
  out.g = 1;
  out.lso = out.rso = 0.16;
  out.le = out.re = 0.18;
  return out;
}

export function copyRig(src: Rig, dst: Rig): Rig {
  for (const k of RIG_KEYS) dst[k] = src[k];
  return dst;
}

/** How far the hips must drop so the straighter leg's foot stays on the floor. */
export function legDrop(r: Rig): number {
  const L1 = LIMB.thigh;
  const L2 = LIMB.shin;
  const d = (f: number, o: number, k: number) =>
    L1 * (1 - Math.cos(f)) + L2 * (1 - Math.cos(f - k)) + (L1 + L2) * (1 - Math.cos(o));
  return Math.min(d(r.ltf, r.lto, r.lk), d(r.rtf, r.rto, r.rk));
}

/** Hip height above the avatar origin after grounding. */
export function hipHeight(r: Rig): number {
  return LIMB.restHip + r.y - r.g * legDrop(r);
}

type AnimFn = (t: number, seed: number, r: Rig, p: AvatarPose) => void;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Bicycle the avatar draws under itself (root frame, world units at scale 1).
 * Wheels sit on the floor; the crank turns the pedals around (crankZ, crankY).
 */
export const BIKE = {
  seatY: 0.33,
  wheelR: 0.14,
  rearZ: -0.25,
  frontZ: 0.36,
  crankZ: 0.07,
  crankY: 0.115,
  crankR: 0.05,
  /** ankle above the pedal axle (shoe sole on the pedal) */
  ankleAbovePedal: 0.03,
  /** wheel turns per crank turn */
  gear: 2
} as const;

/**
 * Crank angle (radians). Moving: follows the walk phase (= distance travelled),
 * so the wheels roll without sliding. Parked: a steady pedal from animTime.
 */
export function bikeCrank(p: AvatarPose): number {
  // walkPhase grows 9 rad per WALK_SPEED (0.85) of distance; wheel angle = distance / wheelR
  return p.walking ? (p.walkPhase * (0.85 / 9)) / BIKE.wheelR / BIKE.gear : p.animTime * TAU * 0.55;
}
/** arm angles that put the hands on the handlebar grips */
export const BIKE_ARM = { sf: 1.3, e: 0.6 } as const;
export const bikeWheel = (p: AvatarPose) => bikeCrank(p) * BIKE.gear;

/**
 * Two-bone leg IK in the side plane: put the ankle at (dz, dy) from the hip
 * pivot. Knee bends forward (positive k), like the rest of the rig.
 */
function legIK(r: Rig, side: "l" | "r", dz: number, dy: number) {
  const L1 = LIMB.thigh;
  const L2 = LIMB.shin;
  const d = Math.max(L1 - L2 + 1e-4, Math.min(L1 + L2 - 1e-5, Math.hypot(dz, dy)));
  const base = Math.atan2(dz, -dy);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const inner = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  if (side === "l") {
    r.ltf = base + alpha;
    r.lk = Math.PI - inner;
  } else {
    r.rtf = base + alpha;
    r.rk = Math.PI - inner;
  }
}

/** Ankle on the pedal at crank angle c (pedalling forward: the top of the crank moves to the front). */
function pedal(r: Rig, side: "l" | "r", c: number) {
  const hipY = LIMB.restHip + r.y - LIMB.hipDrop;
  const z = BIKE.crankZ - BIKE.crankR * Math.sin(c);
  const y = BIKE.crankY - BIKE.crankR * Math.cos(c) + BIKE.ankleAbovePedal;
  legIK(r, side, z - r.z, y - hipY);
}

/** Watching a film with popcorn: 7 s cycle — reach into the tub, then a kernel to the mouth. */
const POPCORN_CYCLE = 7;
export const popcornReach = (t: number) => window_(t % POPCORN_CYCLE, 3.1, 4.3, 0.35);
/** 0..1: the right hand is up at the mouth with a kernel. */
export const popcornBite = (t: number) => window_(t % POPCORN_CYCLE, 3.95, 5.4, 0.4);
/** the kernel shows from the tub until it reaches the mouth */
export const kernelVisible = (t: number) => {
  const q = t % POPCORN_CYCLE;
  return q > 3.85 && q < 4.55;
};
/** a short laugh every 12 s while watching */
const watchLaugh = (t: number) => window_(t % 12, 8.6, 10.4, 0.35);
/** dig: 10 s cycle — dig, pick/plant, stand up and wipe the brow */
const digStand = (t: number) => window_(t % 10, 6.6, 9.4, 0.7);
/** lift: 8 s cycle — alternating curls, then an overhead press */
const LIFT_CYCLE = 8;
const liftPressTop = (t: number) => {
  const p = t % LIFT_CYCLE;
  return p > 5.2 && p < 7.0 ? 0.5 - 0.5 * Math.cos((TAU * (p - 5.2)) / 0.9) : 0;
};

const breathe = (t: number, r: Rig) => {
  const b = osc(t, 0.25);
  r.sx += 0.025 * b;
  r.hx -= 0.02 * b;
  r.lso += 0.025 * b;
  r.rso += 0.025 * b;
};

const lookAround = (t: number, seed: number, r: Rig, amount = 1) => {
  const c = (t + seed * 9) % 9;
  r.hy += amount * (0.4 * window_(c, 3, 4.8, 0.45) - 0.32 * window_(c, 6, 7.6, 0.45));
  r.hx += amount * -0.08 * window_(c, 6, 7.6, 0.45);
};

/**
 * Seated hips + legs: hips stay at standing height (0.31) and the thighs rest on a seat
 * whose top is ~0.24–0.26; the feet swing a little. The body itself stays upright.
 */
function sitLegs(t: number, r: Rig) {
  r.g = 0;
  r.y = 0;
  r.z = 0;
  r.bx = r.by = r.bz = 0;
  const kick = osc(t, 0.45);
  r.ltf = r.rtf = 1.55;
  r.lk = 1.5 + 0.2 * kick;
  r.rk = 1.5 - 0.2 * kick;
  r.lto = r.rto = 0.07;
}

const ANIMS: Record<BodyAnim, AnimFn> = {
  idle(t, s, r) {
    breathe(t, r);
    lookAround(t, s, r);
    r.bz += 0.018 * osc(t, 0.11, s);
  },
  talk(t, _s, r) {
    breathe(t, r);
    r.hx += 0.07 * osc(t, 1.7);
    r.hz += 0.06 * osc(t, 0.55);
    r.hy += 0.16 * osc(t, 0.27);
    r.rsf = 0.5 + 0.2 * osc(t, 0.9);
    r.re = 1.35 + 0.25 * osc(t, 1.8);
    r.rso = 0.3;
    r.rez = 0.35 + 0.25 * osc(t, 0.9, 0.3);
    r.lsf = 0.3 + 0.2 * osc(t, 0.7, 0.5);
    r.le = 1.1 + 0.25 * osc(t, 1.4, 0.2);
    r.lso = 0.28;
    r.lez = 0.2 + 0.2 * osc(t, 0.7, 0.1);
  },
  jump(t, _s, r) {
    const p = t % 1.8;
    // crouch in, push, fly, land, then a calm pause
    const crouch = p < 0.28 ? smooth(p / 0.28) : p < 0.36 ? 1 - smooth((p - 0.28) / 0.08) : p > 0.84 && p < 1.1 ? Math.sin((Math.PI * (p - 0.84)) / 0.26) * 0.8 : 0;
    const air = p > 0.32 && p < 0.86 ? Math.sin((Math.PI * (p - 0.32)) / 0.54) : 0;
    r.y = 0.35 * air;
    r.ltf = r.rtf = 0.75 * crouch + 0.35 * air;
    r.lk = r.rk = 1.4 * crouch + 0.75 * air;
    r.sx = 0.35 * crouch - 0.08 * air;
    r.hx = -0.1 * crouch - 0.15 * air;
    r.lsf = r.rsf = -0.65 * crouch + 2.7 * air;
    r.lso = r.rso = 0.2 + 0.25 * air;
    r.le = r.re = 0.35;
  },
  wave(t, _s, r) {
    breathe(t, r);
    r.rso = 2.5;
    r.rsf = 0.3;
    r.re = 0.35;
    r.rez = 0.5 * osc(t, 2.1);
    r.hz = -0.1;
    r.hy = -0.12;
    r.sz = 0.05;
  },
  dance(t, _s, r) {
    const b = osc(t, 1.0);
    const bounce = osc(t, 2.0);
    r.bz = 0.07 * b;
    r.sz = -0.14 * b;
    r.sy = 0.18 * osc(t, 0.5);
    r.hz = 0.14 * b;
    r.lk = r.rk = 0.4 + 0.3 * bounce;
    r.ltf = r.rtf = 0.2 + 0.15 * bounce;
    r.lsf = 1.7 + 1.2 * b;
    r.rsf = 1.7 - 1.2 * b;
    r.lso = r.rso = 0.55;
    r.le = r.re = 0.75;
    r.lez = 0.3 * b;
    r.rez = -0.3 * b;
  },
  sit(t, s, r) {
    sitLegs(t, r);
    r.sx = -0.06;
    r.lsf = r.rsf = 0.55;
    r.le = r.re = 0.65;
    r.lso = r.rso = 0.1;
    breathe(t, r);
    lookAround(t, s, r, 0.8);
  },
  sleep(t, _s, r) {
    r.g = 0;
    r.y = 0.135 - LIMB.restHip;
    r.z = 0.2;
    r.bx = -Math.PI / 2;
    r.sx = 0.03 * osc(t, 0.2);
    r.hx = 0.42;
    r.hz = 0.12;
    r.lsf = 0.85;
    r.le = 1.45;
    r.lso = -0.05;
    r.rso = 0.22;
    r.re = 0.15;
    r.lto = 0.08;
    r.rto = 0.12;
  },
  clap(t, _s, r) {
    const c = 0.5 + 0.5 * osc(t, 2.4);
    r.lsf = r.rsf = 1.05;
    r.le = r.re = 1.05;
    r.lso = r.rso = 0.2 + 0.25 * c;
    r.lez = r.rez = -0.7 - 0.2 * (1 - c);
    r.lk = r.rk = 0.12 + 0.1 * osc(t, 1.2);
    r.ltf = r.rtf = 0.06;
    r.hz = 0.06 * osc(t, 0.6);
  },
  point(t, _s, r) {
    breathe(t, r);
    r.rsf = 1.5 + 0.07 * osc(t, 1.4);
    r.rso = 0.05;
    r.re = 0.05;
    r.hx = -0.05;
    r.hy = -0.1;
    r.sy = -0.12;
    // other hand on the hip
    r.lso = 0.75;
    r.lsf = -0.15;
    r.le = 0.2;
    r.lez = -1.9;
  },
  cheer(t, _s, r) {
    const hop = Math.abs(Math.sin((Math.PI * t) / 0.7));
    r.y = 0.07 * hop;
    r.lsf = r.rsf = 2.75 + 0.15 * osc(t, 1 / 0.7);
    r.lso = r.rso = 0.5;
    r.le = r.re = 0.25;
    r.hx = -0.12;
    r.lk = r.rk = 0.15 * (1 - hop);
  },
  stretch(t, _s, r) {
    const side = osc(t, 0.22);
    r.lsf = r.rsf = 3.0;
    r.lso = r.rso = 0.12;
    r.le = r.re = 0.12;
    r.lez = r.rez = -0.2;
    r.sz = 0.28 * side;
    r.bz = -0.04 * side;
    r.hx = -0.22;
    r.hz = 0.12 * side;
    r.y = 0.015;
  },
  laugh(t, _s, r) {
    const shake = osc(t, 6);
    r.sx = -0.2 + 0.05 * shake;
    r.hx = -0.32 + 0.06 * osc(t, 6, 0.25);
    r.y = 0.008 * shake;
    // hands holding the belly
    r.lsf = r.rsf = 0.3 + 0.05 * shake;
    r.le = r.re = 1.35;
    r.lso = r.rso = 0.12;
    r.lez = r.rez = -0.75;
    r.hz = 0.08 * osc(t, 0.5);
  },
  cry(t, _s, r) {
    const sob = osc(t, 2.6);
    r.hx = 0.42 + 0.04 * sob;
    r.sx = 0.22 + 0.04 * sob;
    r.lsf = r.rsf = 1.35;
    r.le = r.re = 2.3;
    r.lso = r.rso = 0.05;
    r.lez = r.rez = -0.35;
    r.hy = 0.06 * osc(t, 0.4);
    r.y = 0.006 * sob;
  },
  think(t, _s, r) {
    breathe(t, r);
    r.rsf = 0.75;
    r.re = 2.35 + 0.06 * osc(t, 1.2);
    r.rso = 0.05;
    r.rez = -0.45;
    r.lsf = 0.55;
    r.le = 1.7;
    r.lso = 0.1;
    r.lez = -0.75;
    r.hz = 0.2 + 0.04 * osc(t, 0.3);
    r.hx = -0.14;
    r.hy = 0.12;
    r.bz = 0.03;
  },
  wash(t, _s, r) {
    const rub = osc(t, 3);
    r.lsf = r.rsf = 0.8;
    r.le = r.re = 1.05;
    r.lso = r.rso = 0.15;
    r.lez = -0.65 + 0.12 * rub;
    r.rez = -0.65 - 0.12 * rub;
    r.lw = 0.2 * rub;
    r.rw = -0.2 * rub;
    r.hx = 0.38;
    r.sx = 0.1;
  },
  eat(t, _s, r, pose) {
    const p = t % 1.4;
    const q = p < 0.45 ? smooth(p / 0.45) : p < 0.75 ? 1 : 1 - smooth((p - 0.75) / 0.4);
    r.rsf = 0.5 + 0.6 * q;
    r.re = 1.2 + 1.15 * q;
    r.rso = 0.1;
    r.rez = -0.2 - 0.35 * q;
    r.lsf = 0.6;
    r.le = 1.4;
    r.lso = 0.12;
    r.lez = -0.4;
    r.hx = 0.12 - 0.12 * q;
    // a plate in the left hand comes in front of the chest
    if (pose.item === "plate") {
      r.lez = -0.85;
      r.le = 1.25;
      r.hx += 0.06;
    }
    breathe(t, r);
  },
  drink(t, _s, r) {
    const p = t % 3.6;
    const q = p < 0.6 ? smooth(p / 0.6) : p < 1.9 ? 1 : 1 - smooth((p - 1.9) / 0.6);
    r.rsf = 0.5 + 0.7 * q;
    r.re = 1.25 + 1.1 * q;
    r.rso = 0.1;
    r.rez = -0.2 - 0.3 * q;
    r.hx = -0.28 * q;
    r.sx = -0.05 * q;
    r.lso = 0.75;
    r.lsf = -0.15;
    r.le = 0.2;
    r.lez = -1.9;
    breathe(t, r);
  },
  read(t, _s, r) {
    const flip = window_(t % 6, 4.4, 5.2, 0.3);
    r.lsf = r.rsf = 0.95;
    r.le = r.re = 1.15;
    r.lso = r.rso = 0.1;
    r.lez = r.rez = -0.45;
    r.rez -= 0.5 * flip;
    r.hx = 0.36;
    r.hy = 0.06 * osc(t, 0.3);
    breathe(t, r);
  },
  phone(t, _s, r) {
    breathe(t, r);
    // elbow out to the side, forearm folded up so the hand sits at the ear
    r.rsf = 0.35;
    r.rso = 1.45;
    r.re = 0.35;
    r.rez = 1.65;
    r.hz = 0.2;
    r.hx = 0.04 * osc(t, 1.3);
    r.by = 0.25 * osc(t, 0.12);
    r.lso = 0.25;
    r.lsf = 0.35 + 0.2 * osc(t, 0.6);
    r.le = 1.2;
  },
  sweep(t, _s, r) {
    const sw = osc(t, 0.9);
    r.sy = 0.35 * sw;
    r.sx = 0.15;
    r.hx = 0.25;
    r.hy = 0.15 * sw;
    r.rsf = 0.55;
    r.re = 0.55;
    r.rso = 0.05;
    r.rez = -0.35;
    r.lsf = 0.85;
    r.le = 0.65;
    r.lso = 0.1;
    r.lez = -0.6;
    r.lk = r.rk = 0.15;
    r.ltf = r.rtf = 0.08;
  },
  water(t, _s, r) {
    breathe(t, r);
    r.rsf = 0.8;
    r.re = 0.35;
    r.rso = 0.12;
    r.hx = 0.25;
    r.sx = 0.08;
    r.sy = -0.1 + 0.08 * osc(t, 0.25);
  },
  exercise(t, _s, r) {
    const p = (1 - Math.cos((TAU * t) / 0.9)) / 2;
    r.lso = r.rso = 0.25 + 2.6 * p;
    r.lsf = r.rsf = 0.1;
    r.le = r.re = 0.15;
    r.lto = r.rto = 0.05 + 0.32 * p;
    r.y = 0.05 * Math.abs(Math.sin((TAU * t) / 0.9));
    r.hx = -0.05;
  },
  hug(t, _s, r) {
    // arms around the partner's sides; heads tilt aside so the big heads don't collide
    // step in a little so the short chibi arms reach the partner's back
    r.z = 0.05;
    r.lsf = r.rsf = 1.3;
    r.lso = r.rso = 0.75;
    r.lez = r.rez = -1.1;
    r.le = r.re = 0.1;
    r.sx = 0.04;
    r.hz = 0.42;
    r.hy = 0.45;
    r.hx = 0.05;
    r.bz = 0.035 * osc(t, 0.5);
    r.by = 0.05 * osc(t, 0.5, 0.25);
  },
  kiss(t, _s, r) {
    const lean = 0.5 + 0.5 * osc(t, 0.4);
    // a gentle lean toward the cheek (big heads: keep the lean small)
    r.sx = 0.07 + 0.05 * lean;
    r.hz = 0.3;
    r.hy = 0.35;
    r.hx = 0.04;
    r.lsf = r.rsf = -0.45;
    r.lso = r.rso = 0.1;
    r.le = r.re = 0.5;
    r.lez = r.rez = -0.55;
    r.y = 0.015;
  },
  highfive(t, _s, r) {
    // double high-five beside the (big) heads: partners' palms meet halfway
    const p = t % 2.4;
    const up = p < 0.45 ? smooth(p / 0.45) : p < 1.6 ? 1 : 1 - smooth((p - 1.6) / 0.5);
    const slap = window_(p, 0.45, 0.8, 0.12);
    r.lsf = r.rsf = 2.0 * up + 0.15 * slap;
    r.lso = r.rso = 0.16 + 0.56 * up;
    r.le = r.re = 0.45 * up - 0.25 * slap;
    r.lez = r.rez = -0.15 * up;
    r.sx = 0.1 * slap;
    r.hx = -0.08 * up;
    breathe(t, r);
  },
  handshake(t, _s, r) {
    r.rsf = 0.95 + 0.14 * osc(t, 2.2);
    r.re = 0.5;
    r.rso = 0.05;
    r.rez = -0.45;
    r.sx = 0.06;
    breathe(t, r);
  },
  swim(t, _s, r) {
    // front crawl: body (almost) horizontal, face forward-down; the sim sinks the root into the water
    r.g = 0;
    r.y = 0;
    r.z = -0.15;
    r.bx = 1.4;
    const w = TAU * 0.55 * t;
    // each arm: reach overhead → pull under the body → recover high over the water (out to the side, elbow up)
    const recL = Math.max(0, -Math.sin(w)) ** 2;
    const recR = Math.max(0, Math.sin(w)) ** 2;
    r.lsf = 1.42 + 1.72 * Math.cos(w);
    r.rsf = 1.42 - 1.72 * Math.cos(w);
    // at full reach the arms open into a V so they pass beside the (big) head
    r.lso = 0.18 + 1.85 * recL + 0.55 * Math.max(0, Math.cos(w)) ** 2;
    r.rso = 0.18 + 1.85 * recR + 0.55 * Math.max(0, -Math.cos(w)) ** 2;
    r.le = 0.25 + 1.1 * recL;
    r.re = 0.25 + 1.1 * recR;
    // roll with the stroke, breathe to the side of the recovering arm
    r.by = 0.26 * Math.sin(w);
    r.sy = 0.08 * Math.sin(w);
    r.hx = -0.62;
    r.hy = -0.55 * recR + 0.12 * recL;
    r.hz = 0.1 * Math.sin(w);
    // flutter kick
    const kick = osc(t, 2.4);
    r.ltf = 0.1 + 0.22 * kick;
    r.rtf = 0.1 - 0.22 * kick;
    r.lk = 0.18 + 0.12 * Math.max(0, kick);
    r.rk = 0.18 + 0.12 * Math.max(0, -kick);
    r.lto = r.rto = 0.04;
  },
  bike(t, _s, r, p) {
    // seated on the avatar's own bike: hips on the saddle, feet on the pedals, hands on the bar
    r.g = 0;
    r.y = BIKE.seatY - LIMB.restHip;
    r.z = 0;
    const c = bikeCrank(p);
    pedal(r, "l", c);
    pedal(r, "r", c + Math.PI);
    r.sx = 0.3 + 0.02 * Math.sin(2 * c);
    r.hx = -0.24;
    r.hy = 0.12 * osc(t, 0.13);
    r.bz = 0.025 * Math.sin(c);
    r.sy = -0.04 * Math.sin(c);
    r.lsf = r.rsf = BIKE_ARM.sf;
    r.le = r.re = BIKE_ARM.e;
    r.lso = r.rso = 0.1;
    r.lez = r.rez = -0.05;
  },
  run(t, _s, r) {
    // jog in place (treadmill): quick stride, arms pumping with bent elbows
    const ph = TAU * 1.45 * t;
    applyWalk(ph, 1.9, r, false);
    const sw = Math.sin(ph);
    r.lsf = -0.65 * sw + 0.15;
    r.rsf = 0.65 * sw + 0.15;
    r.le = r.re = 1.45;
    r.lso = r.rso = 0.14;
    r.lez = r.rez = -0.2;
    r.hx = -0.06 + 0.03 * Math.cos(2 * ph);
  },
  lift(t, _s, r) {
    // alternating dumbbell curls, then two overhead presses; feet apart
    const p = t % LIFT_CYCLE;
    const curl = window_(p, 0, 4.4, 0.5);
    const press = window_(p, 4.2, LIFT_CYCLE, 1.0);
    const w = (TAU * p) / 2.3;
    const ql = curl * Math.max(0, Math.sin(w)) ** 2;
    const qr = curl * Math.max(0, -Math.sin(w)) ** 2;
    const up = liftPressTop(t);
    // shoulder press beside the (big) head: rack = elbows out at shoulder height, forearms up;
    // then the arms straighten overhead in a wide V
    const so = lerp(1.45, 2.7, up);
    const ez = lerp(1.5, 0.12, up);
    // curl ↔ rack: the elbows stay folded on the way (weights by the shoulders), the upper
    // arms only swing out once the forearms point up — no straight-armed "T" in between
    const fold = Math.sin(Math.PI * press);
    const out = press * press * (3 - 2 * press);
    r.lsf = lerp(0.12 + 0.25 * ql, 0.22, press) + 0.35 * fold;
    r.rsf = lerp(0.12 + 0.25 * qr, 0.22, press) + 0.35 * fold;
    r.le = Math.max(lerp(0.25 + 2.1 * ql, 0.08, press), 1.9 * fold);
    r.re = Math.max(lerp(0.25 + 2.1 * qr, 0.08, press), 1.9 * fold);
    r.lso = r.rso = lerp(0.2, so, out);
    r.lez = r.rez = lerp(-0.15 * curl, ez, out);
    r.lto = r.rto = 0.13;
    r.lk = r.rk = 0.08 + 0.1 * press * (1 - up);
    r.ltf = r.rtf = 0.04 + 0.05 * press * (1 - up);
    r.hx = -0.06 - 0.1 * up * press;
    r.sx = -0.03 * press;
    breathe(t, r);
  },
  dig(t, _s, r) {
    // bent over a plot: dig with both hands, pick/plant with the right, stand up and wipe the brow
    const p = t % 10;
    const stand = digStand(t);
    const bend = 1 - stand;
    const pick = window_(p, 3.6, 6.4, 0.5);
    const d = 0.5 + 0.5 * osc(t, 1.1);
    const pk = 0.5 - 0.5 * Math.cos((TAU * (p - 3.6)) / 1.4);
    // a low crouch over the plot (short chibi arms must reach the soil)
    r.ltf = r.rtf = 0.95 * bend;
    r.lk = r.rk = 1.65 * bend + 0.04;
    r.lto = r.rto = 0.1 + 0.08 * bend;
    r.sx = 0.72 * bend - 0.08 * stand;
    r.hx = 0.05 * bend - 0.14 * stand;
    r.hy = 0.12 * osc(t, 0.2) * bend;
    // arms down to the soil: digging (both hands, a pumping trowel) → picking (right hand
    // plucks from the soil, then lifts it out to the basket at the side)
    const lsfB = lerp(0.05 + 0.4 * d, 0.25, pick);
    const leB = lerp(0.25 + 0.5 * (1 - d), 0.5, pick);
    const rsfB = lerp(0.05 + 0.4 * d, 0.05 + 0.5 * pk, pick);
    const reB = lerp(0.25 + 0.5 * (1 - d), 0.2 + 0.5 * pk, pick);
    const rsoB = lerp(0.12, 0.15 + 0.5 * pk, pick);
    // standing: right hand wipes the brow, left hand on the hip
    const wipe = osc(t, 1.4);
    r.rsf = lerp(rsfB, 1.4, stand);
    r.re = lerp(reB, 2.3, stand);
    r.rso = lerp(rsoB, 0.32, stand);
    r.rez = lerp(-0.3, -0.45 + 0.3 * wipe, stand);
    r.lsf = lerp(lsfB, -0.15, stand);
    r.le = lerp(leB, 0.2, stand);
    r.lso = lerp(0.12, 0.75, stand);
    r.lez = lerp(-0.3, -1.9, stand);
    r.hz = 0.08 * wipe * stand;
  },
  watch(t, s, r, p) {
    // seated (same hips as sit), leaning back, hands on the lap; popcorn now and then, a laugh every ~12 s
    r.g = 0;
    r.y = 0;
    r.ltf = r.rtf = 1.52;
    r.lk = r.rk = 1.45;
    r.lto = r.rto = 0.1;
    r.sx = -0.18;
    r.hx = 0.1;
    breathe(t, r);
    lookAround(t, s, r, 0.35);
    // left hand holds the tub on the lap, right hand rests
    r.lsf = 0.6;
    r.le = 0.9;
    r.lso = 0.12;
    r.lez = -0.9;
    r.rsf = 0.45;
    r.re = 0.75;
    r.rso = 0.15;
    r.rez = -0.25;
    if (p.item === "popcorn") {
      const reach = popcornReach(t);
      const bite = popcornBite(t);
      r.rsf = lerp(lerp(r.rsf, 0.85, reach), 0.62, bite);
      r.re = lerp(lerp(r.re, 1.0, reach), 2.35, bite);
      r.rez = lerp(lerp(r.rez, -1.0, reach), -0.42, bite);
      r.hx -= 0.08 * bite;
    }
    const laugh = watchLaugh(t);
    const shake = osc(t, 6);
    r.sx += laugh * (-0.12 + 0.04 * shake);
    r.hx += laugh * (-0.28 + 0.06 * osc(t, 6, 0.25));
    r.lso += 0.05 * laugh * shake;
  },
  ride(t, _s, r) {
    // seated in the coaster cart, both hands on the bar in front; calm-excited sway (the sim cheers on the drop)
    r.g = 0;
    r.y = 0;
    r.ltf = r.rtf = 1.45;
    r.lk = r.rk = 1.25;
    r.lto = r.rto = 0.08;
    const sway = osc(t, 0.55);
    r.sx = -0.04 + 0.04 * osc(t, 0.9);
    r.bz = 0.04 * sway;
    r.sz = -0.06 * osc(t, 0.55, 0.1);
    r.hz = 0.08 * osc(t, 0.55, 0.2);
    r.hy = 0.22 * osc(t, 0.21);
    r.hx = -0.1 + 0.05 * osc(t, 1.3);
    r.lsf = r.rsf = 1.15;
    r.le = r.re = 0.55;
    r.lso = r.rso = 0.18 + 0.03 * osc(t, 2.2);
    r.lez = r.rez = -0.35;
  }
};

/** Anims that keep their arm pose while walking (the hands are busy). */
const BUSY_ARMS = new Set<BodyAnim>(["wave", "point", "phone", "drink", "eat", "read", "sweep", "water", "think", "cry", "wash", "clap"]);

/** Anims that move the whole body along (pool lane, bike route, coaster): walking keeps their pose. */
const RIDING = new Set<BodyAnim>(["swim", "bike", "ride"]);

/** Seated anims: hips at seat height, thighs forward. */
export const SEATED_ANIMS: ReadonlySet<BodyAnim> = new Set<BodyAnim>(["sit", "watch", "ride", "bike"]);
/** Anims that keep their own body even when `seated` is set. */
const OWN_BODY = new Set<BodyAnim>([...SEATED_ANIMS, "swim", "sleep"]);
const isSeatedUpper = (p: AvatarPose) => !!p.seated && !OWN_BODY.has(p.anim);

/**
 * Root lift so a seated body's hips sit on the seat whatever the body's scale
 * (the rig is built at scale 1; seats are in world units). The bike is drawn
 * inside the scaled avatar, so it needs none.
 */
export function seatLift(r: Rig, anim: BodyAnim, scale: number, bodyScale: number): number {
  if (anim === "bike" || r.g >= 0.5) return 0;
  const sit = clamp01((r.ltf + r.rtf - 1.6) / 1.2);
  return sit > 0 ? hipHeight(r) * scale * (1 - bodyScale) * sit : 0;
}

/** Items carried in one arm while walking or standing around (the arm holds still). */
const CARRY: Partial<Record<ActionItem, "l" | "r">> = { juice: "r", plate: "l", popcorn: "l", basket: "l" };
const CARRY_ANIMS = new Set<BodyAnim>(["idle", "talk"]);

/** The holding arm: forearm forward (a glass, plate or tub) or a basket hanging on the forearm. */
function applyCarry(item: ActionItem, r: Rig) {
  const side = CARRY[item];
  const basket = item === "basket";
  const sf = basket ? 0.15 : 0.4;
  const e = basket ? 1.55 : 1.5;
  if (side === "l") {
    r.lsf = sf;
    r.le = e;
    r.lso = 0.18;
    r.lez = basket ? -0.15 : -0.3;
    r.lw = 0;
  } else if (side === "r") {
    r.rsf = sf;
    r.re = e;
    r.rso = 0.15;
    r.rez = -0.2;
    r.rw = 0;
  }
}

const ARM_KEYS: RigKey[] = ["lsf", "lso", "lst", "le", "lez", "lw", "rsf", "rso", "rst", "re", "rez", "rw"];
const HEAD_KEYS: RigKey[] = ["hx", "hy", "hz"];

const scratch = restRig();

/** Target rig for a pose (no blending). */
export function samplePose(p: AvatarPose, seed: number, out: Rig): Rig {
  restRig(out);
  const fn = ANIMS[p.anim] ?? ANIMS.idle;
  const t = Math.max(0, p.animTime);
  fn(t, seed, out, p);
  const carry = p.item && CARRY[p.item] ? p.item : null;
  if (isSeatedUpper(p)) {
    // on a seat (also while a coaster cart carries it): legs sit, the upper body plays the anim
    sitLegs(t, out);
    if (carry && CARRY_ANIMS.has(p.anim)) applyCarry(carry, out);
    return out;
  }
  if (!p.walking || RIDING.has(p.anim)) {
    if (carry && CARRY_ANIMS.has(p.anim)) applyCarry(carry, out);
    return out;
  }

  // walking: keep busy arms + head, the rest of the body follows the walk cycle
  copyRig(out, scratch);
  restRig(out);
  if (BUSY_ARMS.has(p.anim)) for (const k of ARM_KEYS) out[k] = scratch[k];
  if (p.anim !== "sleep") for (const k of HEAD_KEYS) out[k] = scratch[k];
  applyWalk(p.walkPhase, p.speed, out, !BUSY_ARMS.has(p.anim));
  if (carry && !BUSY_ARMS.has(p.anim)) applyCarry(carry, out);
  return out;
}

export function applyWalk(phase: number, speed: number, r: Rig, arms: boolean): void {
  const run = Math.max(0, Math.min(1.2, speed - 1));
  const sw = Math.sin(phase);
  const amp = 0.5 + 0.28 * run;
  r.ltf = amp * sw;
  r.rtf = -amp * sw;
  // knee bends while the leg swings forward
  r.lk = 0.12 + (0.65 + 0.6 * run) * Math.max(0, Math.cos(phase));
  r.rk = 0.12 + (0.65 + 0.6 * run) * Math.max(0, -Math.cos(phase));
  r.sx += 0.05 + 0.12 * run;
  r.sy += 0.08 * sw;
  r.hy -= 0.05 * sw;
  r.y += 0.035 * run * Math.abs(Math.cos(phase));
  if (arms) {
    r.lsf = -(0.55 + 0.35 * run) * sw;
    r.rsf = (0.55 + 0.35 * run) * sw;
    r.le = r.re = 0.3 + 0.9 * run;
  }
}

/** Eyes + mouth for an anim at time t (before blinking). */
export function faceFor(p: AvatarPose): FaceState {
  const t = p.animTime;
  const chat = osc(t, 3.3) > 0 ? "open" : "base";
  switch (p.anim) {
    case "talk":
    case "phone":
      return { eyes: "base", mouth: chat };
    case "jump": {
      const ph = t % 1.8;
      return ph > 0.34 && ph < 0.86 ? { eyes: "happy", mouth: "open" } : { eyes: "base", mouth: "base" };
    }
    case "wave":
    case "point":
    case "handshake":
      return { eyes: "base", mouth: "open" };
    case "dance":
    case "clap":
    case "cheer":
    case "laugh":
    case "highfive":
      return { eyes: "happy", mouth: "open" };
    case "sleep":
      return { eyes: "closed", mouth: "o" };
    case "stretch":
      return { eyes: "closed", mouth: "o" };
    case "cry":
      return { eyes: "cry", mouth: "frown" };
    case "think":
      return { eyes: "base", mouth: "flat" };
    case "eat":
      return { eyes: "base", mouth: osc(t, 4) > 0.2 ? "o" : "base" };
    case "drink": {
      const ph = t % 3.6;
      return { eyes: ph > 0.6 && ph < 1.9 ? "closed" : "base", mouth: "base" };
    }
    case "exercise":
      return { eyes: "base", mouth: "o" };
    case "hug":
      return { eyes: "happy", mouth: "base" };
    case "kiss":
      return { eyes: "closed", mouth: "pucker" };
    case "swim":
      // breathe out to the side, otherwise a held breath
      return { eyes: "base", mouth: Math.sin(TAU * 0.55 * t) > 0.55 ? "o" : "flat" };
    case "run":
      return { eyes: "base", mouth: osc(t, 1.45) > 0 ? "o" : "flat" };
    case "lift": {
      const top = liftPressTop(t) > 0.8;
      return { eyes: top ? "closed" : "base", mouth: top ? "o" : "flat" };
    }
    case "dig":
      return digStand(t) > 0.5 ? { eyes: "closed", mouth: "o" } : { eyes: "base", mouth: "flat" };
    case "watch": {
      if (watchLaugh(t) > 0.3) return { eyes: "happy", mouth: "open" };
      const chew = window_(t % POPCORN_CYCLE, 4.5, 6.2, 0.2);
      return { eyes: chew > 0.5 ? "happy" : "base", mouth: chew > 0.5 && osc(t, 3) > 0 ? "o" : "base" };
    }
    case "ride":
      return { eyes: osc(t, 0.3) > 0.4 ? "happy" : "base", mouth: "open" };
    case "bike":
      return { eyes: "base", mouth: "base" };
    default:
      return { eyes: "base", mouth: "base" };
  }
}

/** Which prop the anim shows (null = none). Props stay while walking only for busy-arm anims. */
export function propFor(p: AvatarPose): PropId | null {
  if (p.anim === "bike") return "bike";
  if (p.item) {
    // an item in hand overrides the anim's own prop (drink + juice = glass, not mug)
    if (!p.walking || BUSY_ARMS.has(p.anim) || RIDING.has(p.anim) || CARRY[p.item]) return p.item;
    return null;
  }
  if (p.walking && !BUSY_ARMS.has(p.anim)) return null;
  switch (p.anim) {
    case "drink": return "cup";
    case "read": return "book";
    case "phone": return "phone";
    case "sweep": return "broom";
    case "water": return "can";
    case "eat": return "food";
    case "wash": return "bubbles";
    case "point": return "finger";
    case "sleep": return "zzz";
    default: return null;
  }
}

/** Crossfades joint values between anims so nothing snaps (~0.25 s). */
export class PoseBlender {
  readonly current: Rig = restRig();
  private from: Rig = restRig();
  private target: Rig = restRig();
  private t = 1;
  private key = "";

  constructor(readonly seed: number, readonly blendSeconds = 0.25) {}

  update(p: AvatarPose, dt: number): Rig {
    const key = `${p.anim}|${p.walking ? 1 : 0}|${isSeatedUpper(p) ? 1 : 0}`;
    if (key !== this.key) {
      if (this.key) {
        copyRig(this.current, this.from);
        this.t = 0;
      }
      this.key = key;
    }
    samplePose(p, this.seed, this.target);
    this.t = Math.min(1, this.t + Math.max(0, dt) / this.blendSeconds);
    const e = smooth(this.t);
    for (const k of RIG_KEYS) this.current[k] = this.from[k] + (this.target[k] - this.from[k]) * e;
    return this.current;
  }
}
